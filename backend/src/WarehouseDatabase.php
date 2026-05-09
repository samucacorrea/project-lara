<?php

declare(strict_types=1);

namespace ProjectLara;

use PDO;
use PDOException;

final class WarehouseDatabase
{
    private static ?PDO $connection = null;

    public static function connection(): PDO
    {
        if (self::$connection instanceof PDO) {
            return self::$connection;
        }

        $driver = getenv('WAREHOUSE_DRIVER') ?: 'pgsql';
        $host = getenv('WAREHOUSE_HOST') ?: '127.0.0.1';
        $database = getenv('WAREHOUSE_DB') ?: '';
        $user = getenv('WAREHOUSE_USER') ?: '';
        $password = getenv('WAREHOUSE_PASSWORD') ?: '';
        $port = (int) (getenv('WAREHOUSE_PORT') ?: 5432);
        $sslMode = getenv('WAREHOUSE_SSLMODE') ?: 'prefer';
        $connectTimeout = (int) (getenv('WAREHOUSE_CONNECT_TIMEOUT') ?: 5);
        $queryTimeout = (int) (getenv('WAREHOUSE_QUERY_TIMEOUT') ?: 30);

        if ($driver !== 'pgsql') {
            self::emitConfigurationError('warehouse_invalid_driver', sprintf('Driver inválido para warehouse: %s', $driver));
        }

        $dsn = sprintf(
            'pgsql:host=%s;port=%d;dbname=%s;sslmode=%s;connect_timeout=%d',
            $host,
            $port,
            $database,
            $sslMode,
            $connectTimeout
        );

        try {
            self::$connection = new PDO(
                $dsn,
                $user,
                $password,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_TIMEOUT => $connectTimeout,
                ]
            );

            self::$connection->exec(sprintf("SET statement_timeout TO '%dms'", $queryTimeout * 1000));
        } catch (PDOException $exception) {
            Logger::write('warehouse_connection_failed', [
                'host' => $host,
                'database' => $database,
                'message' => $exception->getMessage(),
                'code' => $exception->getCode(),
            ]);

            self::emitConfigurationError(
                'warehouse_connection_failed',
                project_lara_debug_enabled()
                    ? $exception->getMessage()
                    : 'Não foi possível conectar ao warehouse interno.'
            );
        }

        return self::$connection;
    }

    private static function emitConfigurationError(string $code, string $message): never
    {
        http_response_code(500);

        echo json_encode([
            'error' => $code,
            'message' => $message,
        ]);

        exit;
    }
}
