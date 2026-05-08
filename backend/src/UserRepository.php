<?php

declare(strict_types=1);

namespace ProjectLara;

use InvalidArgumentException;
use PDO;

final class UserRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function all(): array
    {
        $statement = $this->connection->query('SELECT id, name, email, phone, avatar_url, role, created_at, updated_at FROM users ORDER BY created_at DESC');
        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find(int $id): ?array
    {
        $statement = $this->connection->prepare('SELECT id, name, email, phone, avatar_url, role, created_at, updated_at FROM users WHERE id = :id');
        $statement->execute([':id' => $id]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        return $record ?: null;
    }

    public function findWithPasswordByEmail(string $email): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM users WHERE email = :email LIMIT 1');
        $statement->execute([':email' => $email]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        return $record ?: null;
    }

    public function findWithPassword(int $id): ?array
    {
        $statement = $this->connection->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
        $statement->execute([':id' => $id]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        return $record ?: null;
    }

    public function findByEmail(string $email): ?array
    {
        $statement = $this->connection->prepare('SELECT id, name, email, phone, avatar_url, role, created_at, updated_at FROM users WHERE email = :email LIMIT 1');
        $statement->execute([':email' => $email]);
        $record = $statement->fetch(PDO::FETCH_ASSOC);

        return $record ?: null;
    }

    public function create(array $payload): array
    {
        $name = trim((string) ($payload['name'] ?? ''));
        $email = trim((string) ($payload['email'] ?? ''));
        $password = (string) ($payload['password'] ?? '');
        $role = $this->resolveRole($payload['role'] ?? 'viewer');

        if ($name === '' || $email === '' || $password === '') {
            throw new InvalidArgumentException('Nome, e-mail e senha são obrigatórios.');
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT);

        $sql = 'INSERT INTO users (name, email, password_hash, role) VALUES (:name, :email, :password_hash, :role)';
        $statement = $this->connection->prepare($sql);
        $statement->execute([
            ':name' => $name,
            ':email' => strtolower($email),
            ':password_hash' => $passwordHash,
            ':role' => $role,
        ]);

        $id = (int) $this->connection->lastInsertId();
        $user = $this->find($id);
        if (!$user) {
            throw new InvalidArgumentException('Erro ao criar usuário.');
        }

        return $user;
    }

    public function update(int $id, array $payload): array
    {
        $user = $this->find($id);
        if (!$user) {
            throw new InvalidArgumentException('Usuário não encontrado.');
        }

        $fields = [];
        $params = [':id' => $id];

        if (isset($payload['name'])) {
            $fields[] = 'name = :name';
            $params[':name'] = trim((string) $payload['name']);
        }

        if (isset($payload['email'])) {
            $fields[] = 'email = :email';
            $params[':email'] = strtolower(trim((string) $payload['email']));
        }

        if (isset($payload['role'])) {
            $fields[] = 'role = :role';
            $params[':role'] = $this->resolveRole($payload['role']);
        }

        if (array_key_exists('phone', $payload)) {
            $fields[] = 'phone = :phone';
            $value = trim((string) $payload['phone']);
            $params[':phone'] = $value !== '' ? $value : null;
        }

        if (array_key_exists('avatar_url', $payload)) {
            $fields[] = 'avatar_url = :avatar_url';
            $value = trim((string) $payload['avatar_url']);
            $params[':avatar_url'] = $value !== '' ? $value : null;
        }

        if (!empty($payload['password'])) {
            $fields[] = 'password_hash = :password_hash';
            $params[':password_hash'] = password_hash((string) $payload['password'], PASSWORD_BCRYPT);
        }

        if ($fields === []) {
            return $user;
        }

        $sql = sprintf('UPDATE users SET %s WHERE id = :id', implode(', ', $fields));
        $statement = $this->connection->prepare($sql);
        $statement->execute($params);

        $updated = $this->find($id);
        if (!$updated) {
            throw new InvalidArgumentException('Erro ao atualizar usuário.');
        }

        return $updated;
    }

    public function delete(int $id): void
    {
        $statement = $this->connection->prepare('DELETE FROM users WHERE id = :id');
        $statement->execute([':id' => $id]);
    }

    private function resolveRole(string $role): string
    {
        $role = strtolower($role);
        $allowed = ['admin', 'standard', 'viewer'];
        if (!in_array($role, $allowed, true)) {
            throw new InvalidArgumentException('Função de usuário inválida.');
        }

        return $role;
    }
}
