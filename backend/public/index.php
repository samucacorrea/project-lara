<?php

declare(strict_types=1);

require __DIR__ . '/../bootstrap.php';

use ProjectLara\Database;
use ProjectLara\DataSourceRepository;
use ProjectLara\DataSourceSchemaRepository;
use ProjectLara\DashboardSettingsRepository;
use ProjectLara\ExtractorConnectorRepository;
use ProjectLara\ExtractorJobRepository;
use ProjectLara\ReportRepository;
use ProjectLara\UserRepository;
use ProjectLara\Cache\RedisCache;
use ProjectLara\Services\DataSourceInspector;
use ProjectLara\Services\DataQueryService;
use ProjectLara\Services\ExtractorService;
use ProjectLara\Services\GoogleSheetsService;
use ProjectLara\Services\BigQueryService;
use ProjectLara\Services\TokenService;
use ProjectLara\Validators\DataSourceValidator;
use ProjectLara\Validators\ExtractorConnectorValidator;
use ProjectLara\Logger;
use ProjectLara\CalculatedMetricRepository;

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

header('Content-Type: application/json');

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$connection = Database::connection();
$repository = new DataSourceRepository($connection);
$schemaRepository = new DataSourceSchemaRepository($connection);
$googleSheetsService = new GoogleSheetsService();
$bigQueryService = new BigQueryService();
$inspector = new DataSourceInspector($repository, $googleSheetsService, $bigQueryService);
$dashboardRepository = new DashboardSettingsRepository($connection);
$reportRepository = new ReportRepository($connection);
$calculatedMetricRepository = new CalculatedMetricRepository($connection);
$userRepository = new UserRepository($connection);
$extractorConnectorRepository = new ExtractorConnectorRepository($connection);
$extractorJobRepository = new ExtractorJobRepository($connection);
$tokenService = new TokenService(getenv('APP_KEY') ?: null);
$cache = RedisCache::fromEnv();
$queryService = new DataQueryService($repository, $inspector, $googleSheetsService, $bigQueryService, $cache);
$extractorService = new ExtractorService($connection, $extractorConnectorRepository, $extractorJobRepository);
$currentUser = null;

$cacheTtl = static function (string $key, int $fallback): int {
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $fallback;
    }
    $ttl = (int) $value;
    return $ttl > 0 ? $ttl : 0;
};

$cacheFetch = static function (?RedisCache $cache, string $key, string $scope): ?array {
    if (!$cache) {
        return null;
    }
    $cached = $cache->get($key);
    if (is_array($cached)) {
        Logger::write('cache', ['event' => 'hit', 'key' => $key, 'scope' => $scope]);
        return $cached;
    }
    Logger::write('cache', ['event' => 'miss', 'key' => $key, 'scope' => $scope]);
    return null;
};

$cacheStore = static function (?RedisCache $cache, string $key, array $value, int $ttl, string $scope): void {
    if (!$cache || $ttl <= 0) {
        return;
    }
    $cache->set($key, $value, $ttl);
    Logger::write('cache', ['event' => 'set', 'key' => $key, 'ttl' => $ttl, 'scope' => $scope]);
};

$authorizationHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if ($authorizationHeader && preg_match('/Bearer\s+(.*)$/i', $authorizationHeader, $matches)) {
    $rawToken = trim($matches[1]);
    try {
        $payload = $tokenService->validate($rawToken);
        $user = $userRepository->find((int) ($payload['sub'] ?? 0));
        if ($user) {
            $currentUser = $user;
        }
    } catch (\Throwable $exception) {
        // Token inválido ou expirado. Ignora para exigir autenticação explícita nos endpoints.
    }
}

$sanitizeUser = static function (array $user): array {
    return [
        'id' => (int) $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'phone' => $user['phone'] ?? null,
        'avatar_url' => $user['avatar_url'] ?? null,
        'role' => $user['role'],
        'created_at' => $user['created_at'] ?? null,
        'updated_at' => $user['updated_at'] ?? null,
    ];
};

$requireAuth = static function (array $roles = []) use (&$currentUser) {
    if (!$currentUser) {
        http_response_code(401);
        echo json_encode(['error' => 'unauthenticated']);
        exit;
    }

    if ($roles !== [] && !in_array($currentUser['role'], $roles, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'forbidden']);
        exit;
    }

    return $currentUser;
};
$segments = array_values(
    array_filter(
        explode('/', trim($path, '/')),
        static fn (string $segment): bool => $segment !== ''
    )
);
$resource = $segments[0] ?? '';
$resourceId = isset($segments[1]) ? (int) $segments[1] : null;
$debugEnabled = project_lara_debug_enabled();

try {
    if ($resource === 'health') {
        echo json_encode([
            'status' => 'ok',
            'timestamp' => date(DATE_ATOM),
        ], JSON_THROW_ON_ERROR);
        exit;
    }
    if ($resource === 'env-test') {
        echo json_encode([
            'DB_HOST' => getenv('DB_HOST'),
            'REDIS_HOST' => getenv('REDIS_HOST'),
            'APP_URL' => getenv('APP_URL'),
        ]);

        exit;
    }

    if ($resource === 'auth') {
        $sub = $segments[1] ?? '';

        if ($sub === 'login' && $method === 'POST') {
            $body = file_get_contents('php://input');
            $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
            $email = strtolower(trim((string) ($payload['email'] ?? '')));
            $password = (string) ($payload['password'] ?? '');

            if ($email === '' || $password === '') {
                http_response_code(422);
                echo json_encode(['error' => 'validation_error', 'message' => 'E-mail e senha são obrigatórios.']);
                exit;
            }

            $userRecord = $userRepository->findWithPasswordByEmail($email);
            if (!$userRecord || !password_verify($password, $userRecord['password_hash'])) {
                http_response_code(401);
                echo json_encode(['error' => 'invalid_credentials']);
                exit;
            }

            $token = $tokenService->issue($userRecord);
            unset($userRecord['password_hash']);

            echo json_encode([
                'token' => $token,
                'user' => $sanitizeUser($userRecord),
            ], JSON_THROW_ON_ERROR);
            exit;
        }

        if ($sub === 'me' && $method === 'GET') {
            $user = $requireAuth();
            echo json_encode($sanitizeUser($user), JSON_THROW_ON_ERROR);
            exit;
        }

        if ($sub === 'me' && $method === 'PUT') {
            $user = $requireAuth();
            $body = file_get_contents('php://input');
            $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);

            $current = $userRepository->findWithPassword((int) $user['id']);
            if (!$current) {
                http_response_code(404);
                echo json_encode(['error' => 'not_found']);
                exit;
            }

            if (!empty($payload['password'])) {
                $currentPassword = (string) ($payload['current_password'] ?? '');
                if ($currentPassword === '' || !password_verify($currentPassword, $current['password_hash'] ?? '')) {
                    http_response_code(422);
                    echo json_encode(['error' => 'validation_error', 'message' => 'Senha atual inválida.']);
                    exit;
                }
            }

            if (isset($payload['email'])) {
                $existing = $userRepository->findByEmail((string) $payload['email']);
                if ($existing && (int) $existing['id'] !== (int) $user['id']) {
                    http_response_code(422);
                    echo json_encode(['error' => 'validation_error', 'message' => 'E-mail já está em uso.']);
                    exit;
                }
            }

            $updated = $userRepository->update((int) $user['id'], $payload);
            echo json_encode($sanitizeUser($updated), JSON_THROW_ON_ERROR);
            exit;
        }

        if ($sub === 'me' && $method === 'POST' && ($segments[2] ?? null) === 'avatar') {
            $user = $requireAuth();
            if (!isset($_FILES['avatar']) || !is_uploaded_file($_FILES['avatar']['tmp_name'])) {
                http_response_code(422);
                echo json_encode(['error' => 'validation_error', 'message' => 'Arquivo de avatar não enviado.']);
                exit;
            }

            $file = $_FILES['avatar'];
            if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
                http_response_code(422);
                echo json_encode(['error' => 'validation_error', 'message' => 'Falha ao enviar avatar.']);
                exit;
            }

            $extension = pathinfo((string) $file['name'], PATHINFO_EXTENSION);
            $extension = $extension ? strtolower($extension) : 'png';
            $allowed = ['png', 'jpg', 'jpeg', 'webp'];
            if (!in_array($extension, $allowed, true)) {
                http_response_code(422);
                echo json_encode(['error' => 'validation_error', 'message' => 'Formato inválido. Use PNG, JPG ou WEBP.']);
                exit;
            }

            $uploadsDir = __DIR__ . '/uploads/avatars';
            if (!is_dir($uploadsDir)) {
                mkdir($uploadsDir, 0755, true);
            }

            $filename = sprintf('avatar_%d_%s.%s', (int) $user['id'], bin2hex(random_bytes(6)), $extension);
            $destination = $uploadsDir . '/' . $filename;
            if (!move_uploaded_file($file['tmp_name'], $destination)) {
                http_response_code(500);
                echo json_encode(['error' => 'upload_failed', 'message' => 'Não foi possível salvar o avatar.']);
                exit;
            }

            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            $avatarUrl = sprintf('%s://%s/uploads/avatars/%s', $scheme, $host, $filename);

            $updated = $userRepository->update((int) $user['id'], ['avatar_url' => $avatarUrl]);
            echo json_encode(['avatar_url' => $avatarUrl, 'user' => $sanitizeUser($updated)], JSON_THROW_ON_ERROR);
            exit;
        }

        http_response_code(405);
        echo json_encode(['error' => 'method_not_allowed']);
        exit;
    }

    if ($resource === 'users') {
        $authUser = $requireAuth(['admin']);
        $userId = $segments[1] ?? null;

        if ($userId === null) {
            if ($method === 'GET') {
                echo json_encode($userRepository->all(), JSON_THROW_ON_ERROR);
                exit;
            }

            if ($method === 'POST') {
                $body = file_get_contents('php://input');
                $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
                $created = $userRepository->create($payload);
                echo json_encode($created, JSON_THROW_ON_ERROR);
                exit;
            }
        } else {
            $userIdInt = (int) $userId;

            if ($method === 'PUT') {
                $body = file_get_contents('php://input');
                $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
                $updated = $userRepository->update($userIdInt, $payload);
                echo json_encode($updated, JSON_THROW_ON_ERROR);
                exit;
            }

            if ($method === 'DELETE') {
                if ($authUser['id'] === $userIdInt) {
                    http_response_code(422);
                    echo json_encode(['error' => 'validation_error', 'message' => 'Você não pode remover seu próprio usuário.']);
                    exit;
                }

                $userRepository->delete($userIdInt);
                http_response_code(204);
                exit;
            }
        }

        http_response_code(405);
        echo json_encode(['error' => 'method_not_allowed']);
        exit;
    }

    if ($resource === 'data-sources') {
        $authUser = $requireAuth(['admin', 'standard']);
        if ($resourceId === null) {
            if ($method === 'GET') {
                $cacheKey = 'data_sources:list';
                $ttl = $cacheTtl('DATA_SOURCES_CACHE_TTL', 600);
                $cached = $cacheFetch($cache, $cacheKey, 'data_sources');
                if ($cached !== null) {
                    echo json_encode($cached, JSON_THROW_ON_ERROR);
                    exit;
                }
                $sources = $repository->all();
                $cacheStore($cache, $cacheKey, $sources, $ttl, 'data_sources');
                echo json_encode($sources, JSON_THROW_ON_ERROR);
                exit;
            }

            if ($method === 'POST') {
                if ($authUser['role'] !== 'admin') {
                    http_response_code(403);
                    echo json_encode(['error' => 'forbidden']);
                    exit;
                }
                $body = file_get_contents('php://input');
                $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);

                DataSourceValidator::validate($payload);

                $created = $repository->create($payload);
                if ($cache) {
                    $cache->delete('data_sources:list');
                }
                http_response_code(201);
                echo json_encode($created, JSON_THROW_ON_ERROR);
                exit;
            }
        } else {
            $existing = $repository->find($resourceId);
            if (!$existing) {
                http_response_code(404);
                echo json_encode(['error' => 'not_found']);
                exit;
            }

            $subResource = $segments[2] ?? null;

            if ($subResource === 'tables') {
                $tableName = $segments[3] ?? null;
                $columnsSegment = $segments[4] ?? null;

                if ($tableName !== null && $columnsSegment === 'columns') {
                    $decodedTable = urldecode($tableName);
                    if ($method === 'GET') {
                        $cacheKey = sprintf('data_sources:%s:columns:%s', $resourceId, $decodedTable);
                        $ttl = $cacheTtl('DATA_SOURCE_SCHEMA_CACHE_TTL', 900);
                        $cached = $cacheFetch($cache, $cacheKey, 'data_source_columns');
                        if ($cached !== null) {
                            echo json_encode($cached, JSON_THROW_ON_ERROR);
                            exit;
                        }
                        $columns = $inspector->listColumns($resourceId, $decodedTable);
                        $overrides = $schemaRepository->listForTable((int) $resourceId, $decodedTable);
                        if ($overrides !== []) {
                            foreach ($columns as &$column) {
                                $name = strtolower((string) ($column['name'] ?? ''));
                                if ($name === '' || !isset($overrides[$name])) {
                                    continue;
                                }
                                $column['role'] = $overrides[$name]['role'];
                                $column['semantic_type'] = $overrides[$name]['semantic_type'];
                            }
                            unset($column);
                        }
                        $cacheStore($cache, $cacheKey, $columns, $ttl, 'data_source_columns');
                        echo json_encode($columns, JSON_THROW_ON_ERROR);
                        exit;
                    }

                    if ($method === 'PUT') {
                        if ($authUser['role'] !== 'admin') {
                            http_response_code(403);
                            echo json_encode(['error' => 'forbidden']);
                            exit;
                        }
                        $body = file_get_contents('php://input');
                        $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
                        $columnsPayload = $payload['columns'] ?? null;
                        if (!is_array($columnsPayload)) {
                            http_response_code(422);
                            echo json_encode(['error' => 'validation_error', 'message' => 'Envie uma lista de colunas.']);
                            exit;
                        }

                        $rows = [];
                        foreach ($columnsPayload as $column) {
                            if (!is_array($column)) {
                                continue;
                            }
                            $name = trim((string) ($column['name'] ?? $column['column_name'] ?? ''));
                            if ($name === '') {
                                continue;
                            }
                            $rows[] = [
                                'column_name' => $name,
                                'role' => isset($column['role']) ? (string) $column['role'] : null,
                                'semantic_type' => isset($column['semantic_type']) ? (string) $column['semantic_type'] : null,
                            ];
                        }

                        $schemaRepository->replaceForTable((int) $resourceId, $decodedTable, $rows);
                        if ($cache) {
                            $cache->delete(sprintf('data_sources:%s:columns:%s', $resourceId, $decodedTable));
                        }
                        echo json_encode(['status' => 'ok'], JSON_THROW_ON_ERROR);
                        exit;
                    }

                    http_response_code(405);
                    echo json_encode(['error' => 'method_not_allowed']);
                    exit;
                }

                if ($tableName === null) {
                    if ($method !== 'GET') {
                        http_response_code(405);
                        echo json_encode(['error' => 'method_not_allowed']);
                        exit;
                    }
                    $cacheKey = sprintf('data_sources:%s:tables', $resourceId);
                    $ttl = $cacheTtl('DATA_SOURCE_SCHEMA_CACHE_TTL', 900);
                    $cached = $cacheFetch($cache, $cacheKey, 'data_source_tables');
                    if ($cached !== null) {
                        echo json_encode($cached, JSON_THROW_ON_ERROR);
                        exit;
                    }
                    $tables = $inspector->listTables($resourceId);
                    $cacheStore($cache, $cacheKey, $tables, $ttl, 'data_source_tables');
                    echo json_encode($tables, JSON_THROW_ON_ERROR);
                    exit;
                }

                http_response_code(404);
                echo json_encode(['error' => 'not_found']);
                exit;
            }

            if ($method === 'GET') {
                echo json_encode($existing, JSON_THROW_ON_ERROR);
                exit;
            }

            if ($method === 'PUT') {
                if ($authUser['role'] !== 'admin') {
                    http_response_code(403);
                    echo json_encode(['error' => 'forbidden']);
                    exit;
                }
                $body = file_get_contents('php://input');
                $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);

                DataSourceValidator::validate($payload);

                $updated = $repository->update($resourceId, $payload);
                if ($cache) {
                    $cache->delete('data_sources:list');
                    $cache->delete(sprintf('data_sources:%s:tables', $resourceId));
                }
                echo json_encode($updated, JSON_THROW_ON_ERROR);
                exit;
            }

            if ($method === 'DELETE') {
                if ($authUser['role'] !== 'admin') {
                    http_response_code(403);
                    echo json_encode(['error' => 'forbidden']);
                    exit;
                }
                $repository->delete($resourceId);
                if ($cache) {
                    $cache->delete('data_sources:list');
                    $cache->delete(sprintf('data_sources:%s:tables', $resourceId));
                }
                http_response_code(204);
                exit;
            }
        }

        http_response_code(405);
        echo json_encode(['error' => 'method_not_allowed']);
        exit;
    }

    if ($resource === 'extractors') {
        $authUser = $requireAuth(['admin', 'standard']);
        $sub = $segments[1] ?? null;
        $third = $segments[2] ?? null;

        if ($sub === null) {
            if ($method === 'GET') {
                echo json_encode($extractorConnectorRepository->listAll(), JSON_THROW_ON_ERROR);
                exit;
            }

            if ($method === 'POST') {
                if ($authUser['role'] !== 'admin') {
                    http_response_code(403);
                    echo json_encode(['error' => 'forbidden']);
                    exit;
                }

                $body = file_get_contents('php://input');
                $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
                ExtractorConnectorValidator::validate($payload);
                $connector = $extractorConnectorRepository->create($payload);
                http_response_code(201);
                echo json_encode($connector, JSON_THROW_ON_ERROR);
                exit;
            }
        }

        if ($sub !== null && ctype_digit($sub)) {
            $connectorId = (int) $sub;

            if ($third === 'run' && $method === 'POST') {
                try {
                    $job = $extractorService->runConnector($connectorId, (int) $authUser['id']);
                    echo json_encode($job, JSON_THROW_ON_ERROR);
                } catch (\InvalidArgumentException $exception) {
                    http_response_code(422);
                    echo json_encode(['error' => 'validation_error', 'message' => $exception->getMessage()]);
                }
                exit;
            }

            if ($third === 'jobs' && $method === 'GET') {
                $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 25;
                $jobs = $extractorJobRepository->listForConnector($connectorId, max(1, min($limit, 100)));
                echo json_encode($jobs, JSON_THROW_ON_ERROR);
                exit;
            }

            if ($method === 'GET') {
                echo json_encode($extractorConnectorRepository->find($connectorId), JSON_THROW_ON_ERROR);
                exit;
            }

            if ($method === 'PUT') {
                $body = file_get_contents('php://input');
                $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
                $current = $extractorConnectorRepository->find($connectorId);
                $merged = array_merge($current, $payload);
                ExtractorConnectorValidator::validate($merged, true);
                $connector = $extractorConnectorRepository->update($connectorId, $merged);
                echo json_encode($connector, JSON_THROW_ON_ERROR);
                exit;
            }

            if ($method === 'DELETE') {
                if ($authUser['role'] !== 'admin') {
                    http_response_code(403);
                    echo json_encode(['error' => 'forbidden']);
                    exit;
                }
                $extractorConnectorRepository->delete($connectorId);
                http_response_code(204);
                exit;
            }
        }

        http_response_code(405);
        echo json_encode(['error' => 'method_not_allowed']);
        exit;
    }

    if ($resource === 'calculated-metrics') {
        if ($method === 'GET') {
            $cacheKey = 'calculated_metrics:list';
            $ttl = $cacheTtl('CALCULATED_METRICS_CACHE_TTL', 600);
            $cached = $cacheFetch($cache, $cacheKey, 'calculated_metrics');
            if ($cached !== null) {
                echo json_encode($cached, JSON_THROW_ON_ERROR);
                exit;
            }
            $metrics = $calculatedMetricRepository->all();
            $cacheStore($cache, $cacheKey, $metrics, $ttl, 'calculated_metrics');
            echo json_encode($metrics, JSON_THROW_ON_ERROR);
            exit;
        }

        $requireAuth(['admin', 'standard']);
        if ($method === 'POST') {
            $body = file_get_contents('php://input');
            $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
            $metric = $calculatedMetricRepository->create($payload);
            if ($cache) {
                $cache->delete('calculated_metrics:list');
            }
            http_response_code(201);
            echo json_encode($metric, JSON_THROW_ON_ERROR);
            exit;
        }

        $metricId = isset($segments[1]) ? (int) $segments[1] : null;
        if ($metricId && $method === 'PUT') {
            $body = file_get_contents('php://input');
            $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
            $metric = $calculatedMetricRepository->update($metricId, $payload);
            if ($cache) {
                $cache->delete('calculated_metrics:list');
            }
            echo json_encode($metric, JSON_THROW_ON_ERROR);
            exit;
        }

        if ($metricId && $method === 'DELETE') {
            $calculatedMetricRepository->delete($metricId);
            if ($cache) {
                $cache->delete('calculated_metrics:list');
            }
            http_response_code(204);
            exit;
        }

        http_response_code(405);
        echo json_encode(['error' => 'method_not_allowed']);
        exit;
    }

    if ($resource === 'reports') {
        $sub = $segments[1] ?? null;
        $third = $segments[2] ?? null;

        if ($sub === null) {
            if ($method === 'GET') {
                $user = $requireAuth();
                echo json_encode($reportRepository->listForUser((int) $user['id']), JSON_THROW_ON_ERROR);
                exit;
            }

            if ($method === 'POST') {
                $user = $requireAuth(['admin', 'standard']);
                $body = file_get_contents('php://input');
                $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
                $payload['owner_id'] = (int) $user['id'];
                $report = $reportRepository->create($payload);
                http_response_code(201);
                echo json_encode($report, JSON_THROW_ON_ERROR);
                exit;
            }
        }

        if ($sub !== null && $third === 'share' && ctype_digit($sub) && $method === 'POST') {
            $user = $requireAuth();
            $reportId = (int) $sub;

            if ($user['role'] !== 'admin' && !$reportRepository->userCanEdit($reportId, (int) $user['id'])) {
                http_response_code(403);
                echo json_encode(['error' => 'forbidden']);
                exit;
            }

            $body = file_get_contents('php://input');
            $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
            $email = strtolower(trim((string) ($payload['email'] ?? '')));
            if ($email === '') {
                http_response_code(422);
                echo json_encode(['error' => 'validation_error', 'message' => 'Informe o e-mail do usuário para compartilhar.']);
                exit;
            }

            $targetUser = $userRepository->findByEmail($email);
            if (!$targetUser) {
                http_response_code(404);
                echo json_encode(['error' => 'user_not_found']);
                exit;
            }

            $permission = isset($payload['permission']) ? strtolower((string) $payload['permission']) : 'edit';
            $reportRepository->shareWithUser($reportId, (int) $targetUser['id'], $permission === 'view' ? 'view' : 'edit');

            echo json_encode(['message' => 'Permissão registrada.'], JSON_THROW_ON_ERROR);
            exit;
        }

        if ($sub !== null && $third === null && ctype_digit($sub)) {
            $reportId = (int) $sub;

            if ($method === 'PUT') {
                $user = $requireAuth();
                if ($user['role'] !== 'admin' && !$reportRepository->userCanEdit($reportId, (int) $user['id'])) {
                    http_response_code(403);
                    echo json_encode(['error' => 'forbidden']);
                    exit;
                }

                $body = file_get_contents('php://input');
                $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
                $report = $reportRepository->update($reportId, $payload);
                echo json_encode($report, JSON_THROW_ON_ERROR);
                exit;
            }

            if ($method === 'DELETE') {
                $user = $requireAuth();
                $report = $reportRepository->findById($reportId);
                if ($user['role'] !== 'admin' && (int) ($report['owner_id'] ?? 0) !== (int) $user['id']) {
                    http_response_code(403);
                    echo json_encode(['error' => 'forbidden']);
                    exit;
                }

                $reportRepository->delete($reportId);
                http_response_code(204);
                exit;
            }
        }

        if ($sub && $method === 'GET') {
            $report = $reportRepository->findBySlug($sub);
            if (!$report) {
                http_response_code(404);
                echo json_encode(['error' => 'not_found']);
                exit;
            }

            $isPublicRequest = false;
            if (isset($_GET['public'])) {
                $raw = strtolower((string) $_GET['public']);
                $isPublicRequest = in_array($raw, ['1', 'true', 'yes'], true);
            }

            if ($isPublicRequest) {
                if (empty($report['is_public'])) {
                    http_response_code(403);
                    echo json_encode(['error' => 'forbidden', 'message' => 'Relatório não está público.']);
                    exit;
                }
            } else {
                $requireAuth();
            }

            echo json_encode($report, JSON_THROW_ON_ERROR);
            exit;
        }

        http_response_code(405);
        echo json_encode(['error' => 'method_not_allowed']);
        exit;
    }

    if ($resource === 'dashboard-settings') {
        $requireAuth();

        if ($method === 'GET') {
            echo json_encode($dashboardRepository->get(), JSON_THROW_ON_ERROR);
            exit;
        }

        if ($method === 'PUT') {
            $requireAuth(['admin']);
            $body = file_get_contents('php://input');
            $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
            $updated = $dashboardRepository->update($payload);
            echo json_encode($updated, JSON_THROW_ON_ERROR);
            exit;
        }

        http_response_code(405);
        echo json_encode(['error' => 'method_not_allowed']);
        exit;
    }

    if ($resource === 'debug' && ($segments[1] ?? '') === 'logs' && $method === 'POST') {
        $requireAuth();
        $body = file_get_contents('php://input');
        $payload = json_decode($body ?: '{}', true);
        Logger::write('frontend', is_array($payload) ? $payload : ['raw' => $body]);
        http_response_code(204);
        exit;
    }

    if ($resource === 'data-query' && $method === 'POST') {
        $body = file_get_contents('php://input');
        $payload = json_decode($body ?: '{}', true, 512, JSON_THROW_ON_ERROR);
        $shareSlug = isset($payload['share_slug']) ? trim((string) $payload['share_slug']) : null;

        if ($shareSlug !== null && $shareSlug !== '') {
            $report = $reportRepository->findBySlug($shareSlug);
            if (!$report) {
                http_response_code(404);
                echo json_encode(['error' => 'not_found']);
                exit;
            }

            unset($payload['share_slug']);
            if (!isset($payload['data_source_id']) || !$payload['data_source_id']) {
                if (!empty($report['data_source_id'])) {
                    $payload['data_source_id'] = (string) $report['data_source_id'];
                }
            } elseif (!empty($report['data_source_id'])) {
                $payload['data_source_id'] = (string) $report['data_source_id'];
            }
        } else {
            $requireAuth();
        }

        $result = $queryService->query($payload);
        echo json_encode($result, JSON_THROW_ON_ERROR);
        exit;
    }

    http_response_code(404);
    echo json_encode(['error' => 'not_found']);
} catch (\InvalidArgumentException $exception) {
    http_response_code(422);
    echo json_encode([
        'error' => 'validation_error',
        'message' => $exception->getMessage(),
        'debug' => $debugEnabled ? [
            'exception' => get_class($exception),
        ] : null,
    ]);
} catch (\JsonException $exception) {
    http_response_code(400);
    echo json_encode([
        'error' => 'invalid_json',
        'message' => $exception->getMessage(),
        'debug' => $debugEnabled ? [
            'exception' => get_class($exception),
        ] : null,
    ]);
} catch (\Throwable $exception) {
    Logger::write('backend_exception', [
        'message' => $exception->getMessage(),
        'exception' => get_class($exception),
        'trace' => project_lara_debug_enabled() ? $exception->getTraceAsString() : null,
        'path' => $path,
        'method' => $method,
    ]);
    http_response_code(500);
    echo json_encode([
        'error' => 'unexpected_error',
        'message' => $debugEnabled ? $exception->getMessage() : 'Ops! Algo deu errado.',
        'debug' => $debugEnabled ? [
            'exception' => get_class($exception),
            'trace' => $exception->getTraceAsString(),
        ] : null,
    ]);
}
