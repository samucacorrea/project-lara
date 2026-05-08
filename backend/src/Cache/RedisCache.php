<?php

declare(strict_types=1);

namespace ProjectLara\Cache;

use ProjectLara\Logger;
use Redis;
use Throwable;

final class RedisCache
{
    private ?Redis $client;

    private function __construct(?Redis $client)
    {
        $this->client = $client;
    }

    public static function fromEnv(): ?self
    {
        $host = getenv('REDIS_HOST') ?: '';
        if ($host === '') {
            return null;
        }

        if (!class_exists(Redis::class)) {
            Logger::write('cache', ['message' => 'Redis extension unavailable.']);
            return null;
        }

        $port = (int) (getenv('REDIS_PORT') ?: 6379);
        $database = (int) (getenv('REDIS_DB') ?: 0);
        $password = getenv('REDIS_PASSWORD') ?: null;
        $timeout = (float) (getenv('REDIS_TIMEOUT') ?: 1.5);

        try {
            $client = new Redis();
            $client->connect($host, $port, $timeout);
            if ($password) {
                $client->auth($password);
            }
            if ($database > 0) {
                $client->select($database);
            }
            return new self($client);
        } catch (Throwable $exception) {
            Logger::write('cache', [
                'message' => 'Failed to connect to Redis.',
                'error' => $exception->getMessage(),
            ]);
            return null;
        }
    }

    public function get(string $key): ?array
    {
        if (!$this->client) {
            return null;
        }

        try {
            $value = $this->client->get($key);
            if ($value === false || $value === null) {
                return null;
            }
            $decoded = json_decode((string) $value, true);
            return is_array($decoded) ? $decoded : null;
        } catch (Throwable $exception) {
            Logger::write('cache', [
                'message' => 'Redis GET failed.',
                'key' => $key,
                'error' => $exception->getMessage(),
            ]);
            return null;
        }
    }

    public function set(string $key, array $value, int $ttlSeconds): void
    {
        if (!$this->client) {
            return;
        }

        try {
            $payload = json_encode($value, JSON_THROW_ON_ERROR);
            $this->client->setex($key, $ttlSeconds, $payload);
        } catch (Throwable $exception) {
            Logger::write('cache', [
                'message' => 'Redis SET failed.',
                'key' => $key,
                'error' => $exception->getMessage(),
            ]);
        }
    }

    public function delete(string $key): void
    {
        if (!$this->client) {
            return;
        }

        try {
            $this->client->del($key);
        } catch (Throwable $exception) {
            Logger::write('cache', [
                'message' => 'Redis DEL failed.',
                'key' => $key,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
