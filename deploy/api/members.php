<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

try {
    $userId = require_auth();
    $connection = db();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $result = $connection->query(
            "SELECT
                m.id,
                m.name,
                m.category,
                m.gender,
                f.name AS family,
                m.marital_status AS maritalStatus,
                m.married_group AS marriedGroup,
                m.class_name AS className,
                m.phone,
                DATE_FORMAT(m.created_at, '%Y-%m-%d') AS createdAt
             FROM members m
             LEFT JOIN families f ON f.id = m.family_id
             ORDER BY m.name ASC"
        );

        json_response($result->fetch_all(MYSQLI_ASSOC));
    }

    require_method('POST');

    $body = request_body();

    $id = trim((string) ($body['id'] ?? ''));
    $name = trim((string) ($body['name'] ?? ''));
    $gender = trim((string) ($body['gender'] ?? ''));
    $family = trim((string) ($body['family'] ?? ''));
    $maritalStatus = trim((string) ($body['maritalStatus'] ?? ''));
    $marriedGroup = trim((string) ($body['marriedGroup'] ?? ''));
    $className = trim((string) ($body['className'] ?? ''));
    $phone = trim((string) ($body['phone'] ?? ''));
    $createdAt = trim((string) ($body['createdAt'] ?? date('Y-m-d')));

    if ($id === '' || $name === '' || $family === '' || $gender === '') {
        json_response([
            'error' => 'Member ID, name, family and gender are required.'
        ], 400);
    }

    if (strlen($id) > 20 || strlen($name) > 150) {
        json_response(['error' => 'The member ID or name is too long.'], 400);
    }

    if (!in_array($gender, ['Male', 'Female'], true)) {
        json_response(['error' => 'Please select a valid gender.'], 400);
    }

    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $createdAt);
    if (!$date || $date->format('Y-m-d') !== $createdAt) {
        json_response(['error' => 'Please provide a valid creation date.'], 400);
    }

    // Resolve the selected family name to its database ID.
    $familyStatement = $connection->prepare(
        'SELECT id FROM families WHERE name = ? LIMIT 1'
    );
    $familyStatement->bind_param('s', $family);
    $familyStatement->execute();
    $familyRecord = $familyStatement->get_result()->fetch_assoc();

    if (!$familyRecord) {
        json_response(['error' => 'The selected family does not exist.'], 400);
    }

    $familyId = (int) $familyRecord['id'];
    $category = $family === 'Visitor' ? 'Visitor' : 'Member';

    $statement = $connection->prepare(
        'INSERT INTO members
            (id, name, category, gender, family_id, marital_status,
             married_group, class_name, phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    $values = [
        $id,
        $name,
        $category,
        $gender,
        $familyId,
        $maritalStatus,
        $marriedGroup,
        $className,
        $phone,
        $createdAt
    ];

    bind_values($statement, 'ssssisssss', $values);
    $statement->execute();

    json_response([
        'id' => $id,
        'name' => $name,
        'category' => $category,
        'gender' => $gender,
        'family' => $family,
        'maritalStatus' => $maritalStatus,
        'marriedGroup' => $marriedGroup,
        'className' => $className,
        'phone' => $phone,
        'createdAt' => $createdAt
    ], 201);

} catch (Throwable $error) {
    handle_server_error($error);
}