<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: https://bizzleap.loantain.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

// Configuration
$uploadDir = __DIR__ . '/uploads/';
$maxFileSize = 5 * 1024 * 1024; // 5MB
$allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
$maxWidth = 1024;
$maxHeight = 1024;

// Create uploads directory if it doesn't exist
if (!file_exists($uploadDir)) {
    if (!mkdir($uploadDir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create upload directory']);
        exit();
    }
}

// Check if file was uploaded
if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'No image file uploaded or upload error']);
    exit();
}

$file = $_FILES['image'];

// Validate file size
if ($file['size'] > $maxFileSize) {
    http_response_code(400);
    echo json_encode(['error' => 'File too large. Maximum size: 5MB']);
    exit();
}

// Validate file type
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!in_array($mimeType, $allowedTypes)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid file type. Allowed: JPEG, PNG, WebP']);
    exit();
}

// Get image dimensions
$imageInfo = getimagesize($file['tmp_name']);
if ($imageInfo === false) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid image file']);
    exit();
}

$originalWidth = $imageInfo[0];
$originalHeight = $imageInfo[1];

// Generate unique filename
$extension = '';
switch ($mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
        $extension = '.jpg';
        break;
    case 'image/png':
        $extension = '.png';
        break;
    case 'image/webp':
        $extension = '.webp';
        break;
}

$filename = uniqid('img_') . '_' . time() . $extension;
$filePath = $uploadDir . $filename;

// Resize image if needed
if ($originalWidth > $maxWidth || $originalHeight > $maxHeight) {
    $ratio = min($maxWidth / $originalWidth, $maxHeight / $originalHeight);
    $newWidth = round($originalWidth * $ratio);
    $newHeight = round($originalHeight * $ratio);

    // Create new image resource
    $newImage = imagecreatetruecolor($newWidth, $newHeight);

    // Preserve transparency for PNG and WebP
    if ($mimeType === 'image/png' || $mimeType === 'image/webp') {
        imagealphablending($newImage, false);
        imagesavealpha($newImage, true);
        $transparent = imagecolorallocatealpha($newImage, 255, 255, 255, 127);
        imagefill($newImage, 0, 0, $transparent);
    }

    // Load original image
    switch ($mimeType) {
        case 'image/jpeg':
        case 'image/jpg':
            $originalImage = imagecreatefromjpeg($file['tmp_name']);
            break;
        case 'image/png':
            $originalImage = imagecreatefrompng($file['tmp_name']);
            break;
        case 'image/webp':
            $originalImage = imagecreatefromwebp($file['tmp_name']);
            break;
    }

    // Resize
    imagecopyresampled($newImage, $originalImage, 0, 0, 0, 0, $newWidth, $newHeight, $originalWidth, $originalHeight);

    // Save resized image
    switch ($mimeType) {
        case 'image/jpeg':
        case 'image/jpg':
            imagejpeg($newImage, $filePath, 80);
            break;
        case 'image/png':
            imagepng($newImage, $filePath, 8);
            break;
        case 'image/webp':
            imagewebp($newImage, $filePath, 80);
            break;
    }

    // Clean up
    imagedestroy($newImage);
    imagedestroy($originalImage);

    $width = $newWidth;
    $height = $newHeight;
} else {
    // No resize needed, just move the file
    if (!move_uploaded_file($file['tmp_name'], $filePath)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save image']);
        exit();
    }

    $width = $originalWidth;
    $height = $originalHeight;
}

// Get file size after processing
$finalSize = filesize($filePath);

// Return success response
$response = [
    'success' => true,
    'data' => [
        'url' => '/api/uploads/' . $filename,
        'filename' => $filename,
        'size' => $finalSize,
        'width' => $width,
        'height' => $height,
        'originalWidth' => $originalWidth,
        'originalHeight' => $originalHeight
    ]
];

echo json_encode($response);
?>
