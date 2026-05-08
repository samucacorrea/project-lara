<?php

declare(strict_types=1);

require __DIR__ . '/../bootstrap.php';

use ProjectLara\Database;
use ProjectLara\DataSourceRepository;
use ProjectLara\Validators\DataSourceValidator;

$pdo = Database::connection();
$repository = new DataSourceRepository($pdo);
$pdo->beginTransaction();

try {
    $payload = [
        'name' => 'Fonte Teste Automatizada',
        'type' => 'mysql',
        'description' => 'Criada via script de teste',
        'config' => [
            'host' => 'localhost',
            'port' => 3306,
            'database' => 'test',
            'username' => 'tester',
            'password' => 'secret',
        ],
        'status' => 'draft',
    ];

    DataSourceValidator::validate($payload);

    $created = $repository->create($payload);

    if (!isset($created['id'])) {
        throw new RuntimeException('Falha ao criar fonte.');
    }

    echo "[PASS] criação\n";

    $found = $repository->find((int) $created['id']);
    if (!$found) {
        throw new RuntimeException('Fonte recém-criada não encontrada.');
    }
    echo "[PASS] leitura\n";

    $payload['name'] = 'Fonte Atualizada';
    $updated = $repository->update((int) $created['id'], $payload);
    if (($updated['name'] ?? null) !== 'Fonte Atualizada') {
        throw new RuntimeException('Falha ao atualizar fonte.');
    }
    echo "[PASS] atualização\n";

    $repository->delete((int) $created['id']);
    $afterDelete = $repository->find((int) $created['id']);
    if ($afterDelete !== null) {
        throw new RuntimeException('Registro não foi removido.');
    }
    echo "[PASS] remoção\n";

    $pdo->rollBack();
    echo "Todos os testes passaram. Nenhuma alteração permanente foi aplicada.\n";
} catch (Throwable $exception) {
    $pdo->rollBack();
    fwrite(STDERR, sprintf("Teste falhou: %s\n", $exception->getMessage()));
    exit(1);
}
