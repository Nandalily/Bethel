<?php
require_once __DIR__ . '/config.php';

try {
    $userId = require_auth();
    $connection = db();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $result = $connection->query(
            'SELECT member_id AS memberId, attendance_date AS date, status, checked_in_at AS checkedInAt
             FROM attendance ORDER BY attendance_date DESC, checked_in_at DESC'
        );
        json_response($result->fetch_all(MYSQLI_ASSOC));
    }

    require_method('POST');
    $body = request_body();
    $memberId = (string) ($body['memberId'] ?? '');
    $date = (string) ($body['date'] ?? '');
    $status = (string) ($body['status'] ?? 'Present');
    $checkedInAt = !empty($body['checkedInAt']) ? (string) $body['checkedInAt'] : null;
    if ($memberId === '' || $date === '') {
        json_response(['error' => 'Member and date are required.'], 400);
    }

    $statement = $connection->prepare(
        'INSERT INTO attendance (member_id, attendance_date, status, checked_in_at, recorded_by)
         VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), checked_in_at = VALUES(checked_in_at), recorded_by = VALUES(recorded_by)'
    );
    $values = [$memberId, $date, $status, $checkedInAt, $userId];
    bind_values($statement, 'ssssi', $values);
    $statement->execute();
    json_response(['memberId' => $memberId, 'date' => $date, 'status' => $status, 'checkedInAt' => $checkedInAt ?: date(DATE_ATOM)], 201);
} catch (Throwable $error) {
    handle_server_error($error);
}
