<?php
require_once dirname(__DIR__) . '/config.php';

try {
    require_method('POST');
    $body = request_body();
    $username = trim((string) ($body['username'] ?? ''));
    $password = (string) ($body['password'] ?? '');
    if ($username === '' || $password === '') {
        json_response(['error' => 'Username and password are required.'], 400);
    }

    $connection = db();
    $statement = $connection->prepare('SELECT id, password_hash FROM users WHERE username = ? AND is_active = 1 LIMIT 1');
    $statement->bind_param('s', $username);
    $statement->execute();
    $user = $statement->get_result()->fetch_assoc();
    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_response(['error' => 'The username or password is not correct.'], 401);
    }

    start_app_session();
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['last_activity'] = time();
    json_response(['authenticated' => true]);
} catch (Throwable $error) {
    handle_server_error($error);
}
