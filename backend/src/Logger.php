<?php

declare(strict_types=1);

namespace ProjectLara;

final class Logger
{
    private const LOG_DIR = __DIR__ . '/../storage/logs';
    private const LOG_FILE = self::LOG_DIR . '/app.log';

    public static function write(string $channel, array $payload): void
    {
        if (!is_dir(self::LOG_DIR)) {
            mkdir(self::LOG_DIR, 0775, true);
        }

        $entry = json_encode([
            'timestamp' => date('c'),
            'channel' => $channel,
            'payload' => $payload,
        ], JSON_UNESCAPED_UNICODE);

        if ($entry === false) {
            return;
        }

        file_put_contents(self::LOG_FILE, $entry . PHP_EOL, FILE_APPEND);
    }
}
