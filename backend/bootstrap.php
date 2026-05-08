<?php

declare(strict_types=1);

$displayErrors = getenv('PHP_DISPLAY_ERRORS');
if ($displayErrors === false || $displayErrors === '') {
    $displayErrors = '0';
}
ini_set('display_errors', $displayErrors);
ini_set('display_startup_errors', '0');
ini_set('html_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

$rootPath = dirname(__DIR__, 1);
$envFile = $rootPath . DIRECTORY_SEPARATOR . '.env.local';

if (is_readable($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        $delimiterPos = strpos($line, '=');
        if ($delimiterPos === false) {
            continue;
        }
        $key = trim(substr($line, 0, $delimiterPos));
        $value = trim(substr($line, $delimiterPos + 1));
        if ($key !== '') {
            putenv(sprintf('%s=%s', $key, $value));
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }
}

spl_autoload_register(
    static function (string $class): void {
        $prefix = 'ProjectLara\\';
        $baseDir = __DIR__ . '/src/';

        if (strncmp($prefix, $class, strlen($prefix)) !== 0) {
            return;
        }

        $relativeClass = substr($class, strlen($prefix));
        $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';

        if (is_readable($file)) {
            require $file;
        }
    }
);

if (!function_exists('project_lara_debug_enabled')) {
    function project_lara_debug_enabled(): bool
    {
        static $enabled = null;

        if ($enabled === null) {
            $value = getenv('DEBUG_MODE') ?: 'false';
            $enabled = filter_var($value, FILTER_VALIDATE_BOOLEAN);
        }

        return $enabled;
    }
}
