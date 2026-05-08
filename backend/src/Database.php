<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;
use PDOException;

final class Database
{
    private static ?PDO $connection = null;

    public static function connection(): PDO
    {
        if (self::$connection instanceof PDO) {
            return self::$connection;
        }

        $host = getenv('DB_HOST') ?: '127.0.0.1';
        $database = getenv('DB_NAME') ?: '';
        $user = getenv('DB_USER') ?: '';
        $password = getenv('DB_PASSWORD') ?: '';
        $port = (int) (getenv('DB_PORT') ?: 3306);

        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $database);

        try {
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_TIMEOUT => 10,
            ];
            if (defined('PDO::MYSQL_ATTR_READ_TIMEOUT')) {
                $options[PDO::MYSQL_ATTR_READ_TIMEOUT] = 10;
            }
            if (defined('PDO::MYSQL_ATTR_WRITE_TIMEOUT')) {
                $options[PDO::MYSQL_ATTR_WRITE_TIMEOUT] = 10;
            }

            self::$connection = new PDO(
                $dsn,
                $user,
                $password,
                $options
            );
        } catch (PDOException $exception) {
            Logger::write('database_connection_failed', [
                'host' => $host,
                'database' => $database,
                'message' => $exception->getMessage(),
                'code' => $exception->getCode(),
            ]);
            http_response_code(500);
            $payload = [
                'error' => 'database_connection_failed',
                'message' => project_lara_debug_enabled()
                    ? $exception->getMessage()
                    : 'Não foi possível conectar ao banco de dados.',
            ];

            if (project_lara_debug_enabled()) {
                $payload['debug'] = [
                    'exception' => get_class($exception),
                    'trace' => $exception->getTraceAsString(),
                ];
            }

            echo json_encode($payload);
            exit;
        }

        return self::$connection;
    }
}
