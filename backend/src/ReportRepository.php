<?php

declare(strict_types=1);

namespace ProjectLara;

use InvalidArgumentException;
use PDO;

final class ReportRepository
{
    private bool $isPublicColumnReady = false;
    private bool $isLayoutColumnReady = false;
    private bool $isCanvasColumnReady = false;
    private bool $isJoinConfigColumnReady = false;
    private bool $collaboratorsTableChecked = false;
    private bool $collaboratorsTableExists = false;

    public function __construct(private readonly PDO $connection)
    {
    }

    public function create(array $payload): array
    {
        $this->ensureIsPublicColumnExists();
        $this->ensureLayoutColumnExists();
        $this->ensureCanvasColumnExists();
        $this->ensureJoinConfigColumnExists();

        $name = trim((string) ($payload['name'] ?? ''));
        if ($name === '') {
            throw new InvalidArgumentException('O nome do relatório é obrigatório.');
        }

        $widgets = $payload['widgets'] ?? [];
        if (!is_array($widgets) || $widgets === []) {
            throw new InvalidArgumentException('Informe ao menos um widget para salvar.');
        }

        $ownerId = (int) ($payload['owner_id'] ?? 0);
        if ($ownerId <= 0) {
            throw new InvalidArgumentException('Um proprietário válido é obrigatório.');
        }

        $slug = $this->generateUniqueSlug();

        $layoutType = $this->normalizeLayoutType($payload['layout_type'] ?? null);

        $sql = <<<'SQL'
            INSERT INTO reports (name, slug, owner_id, data_source_id, global_filter, date_filter_visible, is_public, layout_type, widgets, canvas_settings, join_config)
            VALUES (:name, :slug, :owner_id, :data_source_id, :global_filter, :date_filter_visible, :is_public, :layout_type, :widgets, :canvas_settings, :join_config)
        SQL;

        $statement = $this->connection->prepare($sql);
        $statement->execute([
            ':name' => $name,
            ':slug' => $slug,
            ':owner_id' => $ownerId,
            ':data_source_id' => $payload['data_source_id'] ?? null,
            ':global_filter' => isset($payload['global_filter'])
                ? json_encode($payload['global_filter'], JSON_THROW_ON_ERROR)
                : null,
            ':date_filter_visible' => isset($payload['date_filter_visible']) && $payload['date_filter_visible'] ? 1 : 0,
            ':is_public' => isset($payload['is_public']) && $payload['is_public'] ? 1 : 0,
            ':layout_type' => $layoutType,
            ':widgets' => json_encode($widgets, JSON_THROW_ON_ERROR),
            ':canvas_settings' => isset($payload['canvas_settings'])
                ? json_encode($payload['canvas_settings'], JSON_THROW_ON_ERROR)
                : null,
            ':join_config' => isset($payload['join_config'])
                ? json_encode($payload['join_config'], JSON_THROW_ON_ERROR)
                : null,
        ]);

        $id = (int) $this->connection->lastInsertId();
        return $this->findById($id);
    }

    public function update(int $id, array $payload): array
    {
        $this->ensureIsPublicColumnExists();
        $this->ensureLayoutColumnExists();
        $this->ensureCanvasColumnExists();
        $this->ensureJoinConfigColumnExists();

        $report = $this->findById($id);

        $fields = [];
        $params = [':id' => $id];
        $debugSizes = [
            'widgets_bytes' => null,
            'canvas_bytes' => null,
        ];

        if (isset($payload['name'])) {
            $name = trim((string) $payload['name']);
            if ($name === '') {
                throw new InvalidArgumentException('O nome do relatório é obrigatório.');
            }
            $fields[] = 'name = :name';
            $params[':name'] = $name;
        }

        if (array_key_exists('data_source_id', $payload)) {
            $fields[] = 'data_source_id = :data_source_id';
            $params[':data_source_id'] = $payload['data_source_id'] ?? null;
        }

        if (array_key_exists('global_filter', $payload)) {
            $fields[] = 'global_filter = :global_filter';
            $params[':global_filter'] = isset($payload['global_filter'])
                ? json_encode($payload['global_filter'], JSON_THROW_ON_ERROR)
                : null;
        }

        if (array_key_exists('date_filter_visible', $payload)) {
            $fields[] = 'date_filter_visible = :date_filter_visible';
            $params[':date_filter_visible'] = $payload['date_filter_visible'] ? 1 : 0;
        }

        if (array_key_exists('is_public', $payload)) {
            $fields[] = 'is_public = :is_public';
            $params[':is_public'] = $payload['is_public'] ? 1 : 0;
        }

        if (array_key_exists('layout_type', $payload)) {
            $fields[] = 'layout_type = :layout_type';
            $params[':layout_type'] = $this->normalizeLayoutType($payload['layout_type']);
        }

        if (isset($payload['widgets'])) {
            $widgets = $payload['widgets'];
            if (!is_array($widgets) || $widgets === []) {
                throw new InvalidArgumentException('Informe ao menos um widget para salvar.');
            }
            $fields[] = 'widgets = :widgets';
            $widgetsJson = json_encode($widgets, JSON_THROW_ON_ERROR);
            $params[':widgets'] = $widgetsJson;
            $debugSizes['widgets_bytes'] = strlen($widgetsJson);
        }

        if (array_key_exists('canvas_settings', $payload)) {
            $fields[] = 'canvas_settings = :canvas_settings';
            if (isset($payload['canvas_settings'])) {
                $canvasJson = json_encode($payload['canvas_settings'], JSON_THROW_ON_ERROR);
                $params[':canvas_settings'] = $canvasJson;
                $debugSizes['canvas_bytes'] = strlen($canvasJson);
            } else {
                $params[':canvas_settings'] = null;
            }
        }

        if (array_key_exists('join_config', $payload)) {
            $fields[] = 'join_config = :join_config';
            if (isset($payload['join_config'])) {
                $params[':join_config'] = json_encode($payload['join_config'], JSON_THROW_ON_ERROR);
            } else {
                $params[':join_config'] = null;
            }
        }

        if ($fields === []) {
            return $report;
        }

        $fields[] = 'updated_at = CURRENT_TIMESTAMP';
        $sql = sprintf('UPDATE reports SET %s WHERE id = :id', implode(', ', $fields));
        $statement = $this->connection->prepare($sql);
        $startedAt = microtime(true);
        $statement->execute($params);
        Logger::write('report_update', [
            'report_id' => $id,
            'duration_ms' => (int) round((microtime(true) - $startedAt) * 1000),
            'sizes' => $debugSizes,
        ]);

        return $this->findById($id);
    }

    public function listForUser(int $userId): array
    {
        $hasCollaborators = $this->collaboratorsTableExists();

        $sql = $hasCollaborators ? <<<'SQL'
            SELECT r.id,
                   r.owner_id,
                   r.name,
                   r.slug,
                   r.data_source_id,
                   r.global_filter,
                   r.date_filter_visible,
                   r.is_public,
                   r.layout_type,
                   r.created_at,
                   r.updated_at,
                   (SELECT COUNT(*) FROM report_collaborators rc2 WHERE rc2.report_id = r.id) AS collaborator_count,
                   rc.permission AS collaborator_permission
              FROM reports r
              LEFT JOIN report_collaborators rc ON rc.report_id = r.id AND rc.user_id = :user
             WHERE r.owner_id = :user OR rc.id IS NOT NULL
        SQL : <<<'SQL'
            SELECT r.id,
                   r.owner_id,
                   r.name,
                   r.slug,
                   r.data_source_id,
                   r.global_filter,
                   r.date_filter_visible,
                   r.is_public,
                   r.layout_type,
                   r.created_at,
                   r.updated_at,
                   0 AS collaborator_count,
                   NULL AS collaborator_permission
              FROM reports r
             WHERE r.owner_id = :user
        SQL;

        $statement = $this->connection->prepare($sql);
        $statement->execute([':user' => $userId]);
        $records = $statement->fetchAll(PDO::FETCH_ASSOC);

        usort(
            $records,
            static fn (array $left, array $right): int => strcmp((string) ($right['updated_at'] ?? ''), (string) ($left['updated_at'] ?? ''))
        );

        return array_map(fn (array $record): array => $this->hydrateListRecord($record), $records);
    }

    public function userCanEdit(int $reportId, int $userId): bool
    {
        $statement = $this->connection->prepare(
            'SELECT 1 FROM reports WHERE id = :report AND owner_id = :user LIMIT 1'
        );
        $statement->execute([':report' => $reportId, ':user' => $userId]);
        if ($statement->fetchColumn()) {
            return true;
        }

        if (!$this->collaboratorsTableExists()) {
            return false;
        }

        $collab = $this->connection->prepare(
            'SELECT 1 FROM report_collaborators WHERE report_id = :report AND user_id = :user AND permission = "edit" LIMIT 1'
        );
        $collab->execute([':report' => $reportId, ':user' => $userId]);

        return (bool) $collab->fetchColumn();
    }

    public function shareWithUser(int $reportId, int $userId, string $permission = 'edit'): void
    {
        if (!$this->collaboratorsTableExists()) {
            throw new InvalidArgumentException('Recurso de colaboração indisponível. Execute a migration 006 para habilitar compartilhamento.');
        }

        $permission = $this->normalizePermission($permission);

        $sql = <<<'SQL'
            INSERT INTO report_collaborators (report_id, user_id, permission)
            VALUES (:report, :user, :permission)
            ON DUPLICATE KEY UPDATE permission = VALUES(permission)
        SQL;

        $statement = $this->connection->prepare($sql);
        $statement->execute([
            ':report' => $reportId,
            ':user' => $userId,
            ':permission' => $permission,
        ]);
    }

    public function findBySlug(string $slug): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM reports WHERE slug = :slug LIMIT 1');
        $statement->execute([':slug' => $slug]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        if (!$record) {
            return null;
        }

        return $this->hydrate($record);
    }

    public function findById(int $id): array
    {
        $statement = $this->connection->prepare('SELECT * FROM reports WHERE id = :id');
        $statement->execute([':id' => $id]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        if (!$record) {
            throw new InvalidArgumentException('Relatório não encontrado.');
        }

        return $this->hydrate($record);
    }

    public function delete(int $id): void
    {
        $statement = $this->connection->prepare('DELETE FROM reports WHERE id = :id');
        $statement->execute([':id' => $id]);
    }

    private function hydrate(array $record): array
    {
        $record['global_filter'] = $this->decodeJsonField($record, 'global_filter');
        $record['widgets'] = $this->decodeJsonField($record, 'widgets', []);
        $record['canvas_settings'] = $this->decodeJsonField($record, 'canvas_settings');
        $record['join_config'] = $this->decodeJsonField($record, 'join_config');

        if (isset($record['owner_id'])) {
            $record['owner_id'] = $record['owner_id'] !== null ? (int) $record['owner_id'] : null;
        }

        if (array_key_exists('collaborator_permission', $record)) {
            $record['collaborator_permission'] = $record['collaborator_permission'] ?: null;
        }

        $record['date_filter_visible'] = (bool) $record['date_filter_visible'];
        $record['is_public'] = isset($record['is_public']) ? (bool) $record['is_public'] : false;
        $record['layout_type'] = $this->normalizeLayoutType($record['layout_type'] ?? null);
        $record['share_url'] = sprintf('%s/report/%s', rtrim($this->shareBaseUrl(), '/'), $record['slug']);

        return $record;
    }

    private function hydrateListRecord(array $record): array
    {
        $record['global_filter'] = $this->decodeJsonField($record, 'global_filter');

        if (isset($record['owner_id'])) {
            $record['owner_id'] = $record['owner_id'] !== null ? (int) $record['owner_id'] : null;
        }

        if (array_key_exists('collaborator_permission', $record)) {
            $record['collaborator_permission'] = $record['collaborator_permission'] ?: null;
        }

        $record['date_filter_visible'] = (bool) $record['date_filter_visible'];
        $record['is_public'] = isset($record['is_public']) ? (bool) $record['is_public'] : false;
        $record['layout_type'] = $this->normalizeLayoutType($record['layout_type'] ?? null);
        $record['share_url'] = sprintf('%s/report/%s', rtrim($this->shareBaseUrl(), '/'), $record['slug']);

        return $record;
    }

    private function shareBaseUrl(): string
    {
        $appUrl = getenv('APP_URL') ?: null;
        if ($appUrl) {
            return $appUrl;
        }

        $frontend = getenv('VITE_APP_URL') ?: null;
        if ($frontend) {
            return $frontend;
        }

        return 'http://localhost:3000';
    }

    private function generateUniqueSlug(): string
    {
        do {
            $slug = bin2hex(random_bytes(4));
            $statement = $this->connection->prepare('SELECT COUNT(*) FROM reports WHERE slug = :slug');
            $statement->execute([':slug' => $slug]);
            $exists = (int) $statement->fetchColumn() > 0;
        } while ($exists);

        return $slug;
    }

    private function normalizePermission(string $permission): string
    {
        $permission = strtolower($permission);
        return $permission === 'view' ? 'view' : 'edit';
    }

    private function ensureIsPublicColumnExists(): void
    {
        if ($this->isPublicColumnReady) {
            return;
        }

        $statement = $this->connection->query("SHOW COLUMNS FROM `reports` LIKE 'is_public'");
        $exists = $statement && $statement->fetch(PDO::FETCH_ASSOC);

        if (!$exists) {
            $this->connection->exec(
                "ALTER TABLE `reports` ADD COLUMN `is_public` TINYINT(1) NOT NULL DEFAULT 0 AFTER `date_filter_visible`"
            );
        }

        $this->isPublicColumnReady = true;
    }

    private function ensureJoinConfigColumnExists(): void
    {
        if ($this->isJoinConfigColumnReady) {
            return;
        }

        $statement = $this->connection->query("SHOW COLUMNS FROM `reports` LIKE 'join_config'");
        $exists = $statement && $statement->fetch(PDO::FETCH_ASSOC);

        if (!$exists) {
            $this->connection->exec(
                "ALTER TABLE `reports` ADD COLUMN `join_config` JSON NULL AFTER `canvas_settings`"
            );
        }

        $this->isJoinConfigColumnReady = true;
    }

    private function ensureLayoutColumnExists(): void
    {
        if ($this->isLayoutColumnReady) {
            return;
        }

        $statement = $this->connection->query("SHOW COLUMNS FROM `reports` LIKE 'layout_type'");
        $exists = $statement && $statement->fetch(PDO::FETCH_ASSOC);

        if (!$exists) {
            $this->connection->exec(
                "ALTER TABLE `reports` ADD COLUMN `layout_type` ENUM('desktop','mobile') NOT NULL DEFAULT 'desktop' AFTER `is_public`"
            );
        }

        $this->isLayoutColumnReady = true;
    }

    private function ensureCanvasColumnExists(): void
    {
        if ($this->isCanvasColumnReady) {
            return;
        }

        $statement = $this->connection->query("SHOW COLUMNS FROM `reports` LIKE 'canvas_settings'");
        $exists = $statement && $statement->fetch(PDO::FETCH_ASSOC);

        if (!$exists) {
            $this->connection->exec(
                "ALTER TABLE `reports` ADD COLUMN `canvas_settings` JSON NULL AFTER `widgets`"
            );
        }

        $this->isCanvasColumnReady = true;
    }

    private function collaboratorsTableExists(): bool
    {
        if ($this->collaboratorsTableChecked) {
            return $this->collaboratorsTableExists;
        }

        try {
            $statement = $this->connection->query("SHOW TABLES LIKE 'report_collaborators'");
            $this->collaboratorsTableExists = (bool) ($statement && $statement->fetch(PDO::FETCH_NUM));
        } catch (\Throwable) {
            $this->collaboratorsTableExists = false;
        }

        $this->collaboratorsTableChecked = true;

        return $this->collaboratorsTableExists;
    }

    private function decodeJsonField(array $record, string $field, mixed $default = null): mixed
    {
        if (!array_key_exists($field, $record) || $record[$field] === null || $record[$field] === '') {
            return $default;
        }

        if (is_array($record[$field])) {
            return $record[$field];
        }

        try {
            return json_decode((string) $record[$field], true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable $exception) {
            Logger::write('report_decode_error', [
                'field' => $field,
                'value_preview' => substr((string) $record[$field], 0, 120),
                'message' => $exception->getMessage(),
            ]);

            return $default;
        }
    }

    private function normalizeLayoutType(mixed $layout): string
    {
        $value = is_string($layout) ? strtolower($layout) : 'desktop';
        return $value === 'mobile' ? 'mobile' : 'desktop';
    }
}
