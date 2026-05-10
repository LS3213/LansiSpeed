<?php

error_reporting(0);

require_once 'getIP_util.php';

header('Content-Type: application/json; charset=utf-8');
if (isset($_GET['cors'])) {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST');
}
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, s-maxage=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');

$ip = getClientIp();

echo json_encode([
    'processedString' => $ip,
    'rawIspInfo' => '',
]);
