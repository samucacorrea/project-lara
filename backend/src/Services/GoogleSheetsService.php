<?php

declare(strict_types=1);

namespace ProjectLara\Services;

use InvalidArgumentException;
use ProjectLara\Logger;

final class GoogleSheetsService
{
    /**
     * @return array{headers: array<int, string>, rows: array<int, array<string, string>>}
     */
    public function fetch(array $config, ?int $maxRows = null): array
    {
        $spreadsheetId = trim((string) ($config['spreadsheet_id'] ?? ''));
        $worksheet = trim((string) ($config['worksheet'] ?? ''));

        if ($spreadsheetId === '' || $worksheet === '') {
            throw new InvalidArgumentException('Configuração do Google Sheets incompleta.');
        }

        $url = sprintf(
            'https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=%s',
            rawurlencode($spreadsheetId),
            rawurlencode($worksheet)
        );

        $csv = $this->downloadCsv($url);
        if ($csv === '') {
            throw new InvalidArgumentException(
                'Não foi possível acessar a planilha pública do Google Sheets. Verifique se ela está publicada ou compartilhada para leitura.'
            );
        }

        $stream = fopen('php://temp', 'rb+');
        fwrite($stream, $csv);
        rewind($stream);

        $headers = [];
        $rows = [];
        $rowCount = 0;
        $uniqueNames = [];

        while (($data = fgetcsv($stream)) !== false) {
            if ($headers === []) {
                foreach ($data as $index => $header) {
                    $name = trim((string) $header);
                    if ($name === '') {
                        $name = sprintf('column_%d', $index + 1);
                    }

                    $baseName = $name;
                    $suffix = 1;
                    while (in_array(strtolower($name), $uniqueNames, true)) {
                        $name = sprintf('%s_%d', $baseName, ++$suffix);
                    }
                    $uniqueNames[] = strtolower($name);
                    $headers[$index] = $name;
                }
                continue;
            }

            if ($maxRows !== null && $rowCount >= $maxRows) {
                break;
            }

            $isEmpty = true;
            $row = [];
            foreach ($headers as $index => $name) {
                $value = $data[$index] ?? '';
                if ($value !== '' && $value !== null) {
                    $isEmpty = false;
                }
                $row[$name] = (string) $value;
            }

            if ($isEmpty) {
                continue;
            }

            $rows[] = $row;
            $rowCount++;
        }

        fclose($stream);

        return [
            'headers' => array_values($headers),
            'rows' => $rows,
            'spreadsheet_id' => $spreadsheetId,
            'worksheet' => $worksheet,
        ];
    }

    private function downloadCsv(string $url): string
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 20,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_USERAGENT => 'ProjectLaraBot/1.0',
            ]);
            $content = curl_exec($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            if ($content !== false && $status >= 200 && $status < 300) {
                return $content;
            }

            Logger::write('google_sheets_error', [
                'transport' => 'curl',
                'url' => $url,
                'status' => $status ?? null,
                'error' => $error,
                'snippet' => is_string($content) ? substr($content, 0, 200) : null,
            ]);
        }

        $context = stream_context_create([
            'http' => [
                'timeout' => 20,
                'ignore_errors' => true,
                'header' => "User-Agent: ProjectLaraBot/1.0\r\n",
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);

        $content = @file_get_contents($url, false, $context);
        if ($content !== false && $content !== '') {
            return $content;
        }

        Logger::write('google_sheets_error', [
            'transport' => 'file_get_contents',
            'url' => $url,
            'error' => $this->lastPhpError(),
            'snippet' => is_string($content) ? substr($content, 0, 200) : null,
        ]);

        return '';
    }

    private function lastPhpError(): ?string
    {
        $error = error_get_last();
        return $error ? sprintf('%s in %s:%d', $error['message'], $error['file'], $error['line']) : null;
    }
}
