<?php
require_once dirname(__DIR__) . '/config.php';

try {
    require_method('GET');
    require_auth();
    json_response(['authenticated' => true]);
} catch (Throwable $error) {
    handle_server_error($error);
}
