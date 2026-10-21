<?php
declare(strict_types=1);

const DB_HOST = 'YOUR_INFINITYFREE_MYSQL_HOST';
const DB_USER = 'YOUR_INFINITYFREE_MYSQL_USER';
const DB_PASSWORD = 'YOUR_INFINITYFREE_MYSQL_PASSWORD';
const DB_NAME = 'YOUR_INFINITYFREE_DATABASE_NAME';

function db(): mysqli
{
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $connection = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME);
    $connection->set_charset('utf8mb4');
    return $connection;
}

function start_app_session(): void
{
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => $secure,
        'path' => '/',
    ]);
    session_start();
}

function json_response(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

function request_body(): array
{
    $body = json_decode(file_get_contents('php://input'), true);
    return is_array($body) ? $body : [];
}

function require_method(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        json_response(['error' => 'Method not allowed.'], 405);
    }
}

function require_auth(): int
{
    start_app_session();
    $timeout = 60 * 60;
    if (empty($_SESSION['user_id']) || time() - (int) ($_SESSION['last_activity'] ?? 0) >= $timeout) {
        session_unset();
        session_destroy();
        json_response(['error' => 'Your session expired. Please log in again.'], 401);
    }
    $_SESSION['last_activity'] = time();
    return (int) $_SESSION['user_id'];
}

function bind_values(mysqli_stmt $statement, string $types, array $values): void
{
    $references = [$types];
    foreach ($values as $index => $value) {
        $references[] = &$values[$index];
    }
    call_user_func_array([$statement, 'bind_param'], $references);
}

function handle_server_error(Throwable $error): never
{
    error_log($error->getMessage());
    json_response(['error' => 'The server could not complete the request.'], 500);
}
