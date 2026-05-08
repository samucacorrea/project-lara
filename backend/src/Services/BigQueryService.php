<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;
use ProjectLara\Logger;

final class BigQueryService
{
    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';
    private const SCOPES = [
        'https://www.googleapis.com/auth/bigquery.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
    ];

    /**
     * @return array<int, array{name: string}>
     */
    public function listTables(array $config): array
    {
        $projectId = $this->require($config, 'project_id');
        $dataset = $this->require($config, 'dataset');

        $response = $this->request(
            'GET',
            sprintf(
                'https://bigquery.googleapis.com/bigquery/v2/projects/%s/datasets/%s/tables?maxResults=1000',
                rawurlencode($projectId),
                rawurlencode($dataset)
            ),
            $config
        );

        $tables = [];
        foreach ($response['tables'] ?? [] as $table) {
            $tableId = $table['tableReference']['tableId'] ?? null;
            if (is_string($tableId) && $tableId !== '') {
                $tables[] = ['name' => $tableId];
            }
        }

        if ($tables === [] && isset($config['table']) && $config['table'] !== '') {
            $tables[] = ['name' => (string) $config['table']];
        }

        if (isset($config['tables']) && is_array($config['tables'])) {
            foreach ($config['tables'] as $table) {
                if (!is_string($table) || $table === '') {
                    continue;
                }
                $tables[] = ['name' => $table];
            }
        }

        if ($tables !== []) {
            $unique = [];
            $deduped = [];
            foreach ($tables as $table) {
                $name = $table['name'] ?? '';
                if (!is_string($name) || $name === '') {
                    continue;
                }
                if (isset($unique[$name])) {
                    continue;
                }
                $unique[$name] = true;
                $deduped[] = ['name' => $name];
            }
            return $deduped;
        }

        return $tables;
    }

    /**
     * @return array<int, array{name: string, type: string}>
     */
    public function listColumns(array $config, string $table): array
    {
        $projectId = $this->require($config, 'project_id');
        $dataset = $this->require($config, 'dataset');
        $tableId = $table !== '' ? $table : $this->require($config, 'table');

        $response = $this->request(
            'GET',
            sprintf(
                'https://bigquery.googleapis.com/bigquery/v2/projects/%s/datasets/%s/tables/%s',
                rawurlencode($projectId),
                rawurlencode($dataset),
                rawurlencode($tableId)
            ),
            $config
        );

        $columns = [];
        foreach ($response['schema']['fields'] ?? [] as $field) {
            if (!isset($field['name'])) {
                continue;
            }

            $columns[] = [
                'name' => (string) $field['name'],
                'type' => strtolower((string) ($field['type'] ?? 'string')),
            ];
        }

        return $columns;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function runQuery(array $config, string $sql): array
    {
        $projectId = $this->require($config, 'project_id');

        $response = $this->request(
            'POST',
            sprintf(
                'https://bigquery.googleapis.com/bigquery/v2/projects/%s/queries',
                rawurlencode($projectId)
            ),
            $config,
            json_encode(
                [
                    'query' => $sql,
                    'useLegacySql' => false,
                ],
                JSON_THROW_ON_ERROR
            )
        );

        $rows = [];
        $fields = $response['schema']['fields'] ?? [];

        foreach ($response['rows'] ?? [] as $row) {
            $entry = [];
            foreach (($row['f'] ?? []) as $index => $columnValue) {
                $name = $fields[$index]['name'] ?? (string) $index;
                $entry[$name] = $columnValue['v'] ?? null;
            }
            $rows[] = $entry;
        }

        return $rows;
    }

    private function request(string $method, string $url, array $config, ?string $body = null): array
    {
        $token = $this->fetchAccessToken($config);
        $headers = [
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
        ];

        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
        }

        [$status, $responseBody] = $this->httpRequest($method, $url, $headers, $body);

        if ($status < 200 || $status >= 300) {
            Logger::write('bigquery_http_error', [
                'url' => $url,
                'status' => $status,
                'body' => substr($responseBody, 0, 500),
            ]);

            throw new InvalidArgumentException('Não foi possível conectar ao BigQuery. Verifique as credenciais e permissões.');
        }

        try {
            /** @var array<string, mixed> */
            return json_decode($responseBody, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            throw new InvalidArgumentException('Retorno inválido do BigQuery: ' . $exception->getMessage());
        }
    }

    private function fetchAccessToken(array $config): string
    {
        $serviceAccount = $this->parseServiceAccount($config);
        $clientEmail = $serviceAccount['client_email'] ?? null;
        $privateKey = $serviceAccount['private_key'] ?? null;

        if (!$clientEmail || !$privateKey) {
            throw new InvalidArgumentException('Credenciais do serviço do Google incompletas.');
        }

        $now = time();
        $header = $this->base64UrlEncode(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
        $claims = [
            'iss' => $clientEmail,
            'scope' => implode(' ', self::SCOPES),
            'aud' => self::TOKEN_URL,
            'exp' => $now + 3600,
            'iat' => $now,
        ];
        $payload = $this->base64UrlEncode(json_encode($claims, JSON_THROW_ON_ERROR));
        $unsigned = sprintf('%s.%s', $header, $payload);

        $privateKeyResource = openssl_pkey_get_private($privateKey);
        if (!$privateKeyResource) {
            throw new InvalidArgumentException('Chave privada do serviço inválida ou inacessível.');
        }

        $signature = '';
        if (!openssl_sign($unsigned, $signature, $privateKeyResource, OPENSSL_ALGO_SHA256)) {
            throw new InvalidArgumentException('Não foi possível assinar o token de autenticação do BigQuery.');
        }

        $assertion = sprintf('%s.%s', $unsigned, $this->base64UrlEncode($signature));

        [$status, $response] = $this->httpRequest(
            'POST',
            self::TOKEN_URL,
            ['Content-Type: application/x-www-form-urlencoded'],
            http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $assertion,
            ])
        );

        if ($status < 200 || $status >= 300) {
            Logger::write('bigquery_token_error', [
                'status' => $status,
                'response' => substr($response, 0, 300),
            ]);
            throw new InvalidArgumentException('Falha ao obter token de acesso para o BigQuery.');
        }

        $decoded = json_decode($response, true);
        if (!is_array($decoded) || empty($decoded['access_token'])) {
            throw new InvalidArgumentException('Resposta inesperada do servidor de autenticação do Google.');
        }

        return (string) $decoded['access_token'];
    }

    /**
     * @return array{0: int, 1: string}
     */
    private function httpRequest(string $method, string $url, array $headers = [], ?string $body = null): array
    {
        $context = stream_context_create([
            'http' => [
                'method' => strtoupper($method),
                'content' => $body ?? '',
                'header' => implode("\r\n", $headers),
                'ignore_errors' => true,
                'timeout' => 30,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        $statusLine = $http_response_header[0] ?? 'HTTP/1.1 500';
        $status = (int) preg_replace('/[^0-9]/', '', substr($statusLine, 9, 3));

        if ($response === false) {
            Logger::write('bigquery_http_transport_error', [
                'url' => $url,
                'error' => error_get_last()['message'] ?? 'file_get_contents failed',
            ]);
            return [500, ''];
        }

        return [$status, $response !== false ? $response : ''];
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function require(array $config, string $key): string
    {
        if (!isset($config[$key]) || trim((string) $config[$key]) === '') {
            throw new InvalidArgumentException(sprintf('Campo obrigatório ausente: %s', $key));
        }

        return trim((string) $config[$key]);
    }

    /**
     * @return array<string, mixed>
     */
    private function parseServiceAccount(array $config): array
    {
        $raw = $config['service_account_json'] ?? '';
        if (is_array($raw)) {
            return $raw;
        }
        if (!is_string($raw) || trim($raw) === '') {
            throw new InvalidArgumentException('Cole o JSON completo da conta de serviço do BigQuery.');
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new InvalidArgumentException('JSON da conta de serviço inválido.');
        }

        return $decoded;
    }
}
