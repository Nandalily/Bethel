<?php
require_once dirname(__DIR__) . '/config.php';

try {
    require_method('POST');
    start_app_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', (bool) $params['secure'], (bool) $params['httponly']);
    }
    session_destroy();
    http_response_code(204);
    exit;
} catch (Throwable $error) {
    handle_server_error($error);
}
