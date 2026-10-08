<?php

namespace App\Http\Controllers;

use App\Models\BoardImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Uploading images for boards, and serving them to screens.
 */
class ImageController extends Controller
{
    /** Types accepted, as found from a file's content. */
    private const TYPES = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        'image/svg+xml' => 'svg',
    ];

    public const MAX_KB = 2048;

    public function index(): JsonResponse
    {
        return response()->json([
            'status' => 200,
            'data' => BoardImage::orderByDesc('id')->get()->map(fn (BoardImage $i) => $this->present($i, withBoards: true)),
            'message' => '',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate(
            ['image' => ['required', 'file', 'max:' . self::MAX_KB]],
            [
                'image.required' => 'Choose an image to upload.',
                'image.max' => 'Images can be up to 2 MB. Make this one smaller and try again.',
            ],
        );

        $file = $request->file('image');
        // The type from the file's content: a file named logo.png that is really something else
        // is refused, whatever the browser said it was.
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getRealPath()) ?: '';
        if ($mime === 'image/svg' || $mime === 'text/xml' || $mime === 'application/xml' || $mime === 'text/plain') {
            // fileinfo names SVG several ways depending on how the file starts; check it really is one.
            $mime = $this->looksLikeSvg($file->getRealPath()) ? 'image/svg+xml' : $mime;
        }

        if (!isset(self::TYPES[$mime])) {
            return response()->json([
                'status' => 422,
                'data' => null,
                'message' => 'Upload a PNG, JPEG, WebP, GIF or SVG image.',
            ], 422);
        }

        $path = Str::uuid() . '.' . self::TYPES[$mime];
        Storage::disk(BoardImage::DISK)->putFileAs('', $file, $path);

        $image = BoardImage::create([
            'name' => Str::limit($file->getClientOriginalName() ?: 'image', 250, ''),
            'mime' => $mime,
            'size' => $file->getSize(),
            'path' => $path,
        ]);

        return response()->json(['status' => 200, 'data' => $this->present($image), 'message' => 'Image uploaded.']);
    }

    /**
     * Remove an image. One still shown on a board is only removed when asked a second time
     * (force), since those boards would show an empty panel instead.
     */
    public function destroy(Request $request, BoardImage $image): JsonResponse
    {
        $boards = $image->boards();
        if ($boards->isNotEmpty() && !$request->boolean('force')) {
            return response()->json([
                'status' => 409,
                'data' => ['boards' => $boards->pluck('name')],
                'message' => 'This image is shown on ' . $boards->pluck('name')->map(fn ($n) => "\"{$n}\"")->join(', ', ' and ') . '. Remove it anyway?',
            ], 409);
        }

        Storage::disk(BoardImage::DISK)->delete($image->path);
        $image->delete();

        return response()->json(['status' => 200, 'data' => null, 'message' => 'Image removed.']);
    }

    /**
     * The image itself, for boards and screens: open, since screens do not sign in.
     *
     * Served with a policy that lets nothing run and loads nothing else. An image shown on a
     * board cannot run code anyway; this covers an SVG opened directly at its address, where any
     * script inside it would otherwise run as part of this site.
     */
    public function show(string $uuid): Response
    {
        $image = BoardImage::where('uuid', $uuid)->first();
        if ($image === null || !Storage::disk(BoardImage::DISK)->exists($image->path)) {
            abort(404);
        }

        return Storage::disk(BoardImage::DISK)->response($image->path, null, [
            'Content-Type' => $image->mime,
            'Content-Security-Policy' => "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
            'X-Content-Type-Options' => 'nosniff',
            // The address never shows a different image, so it can be kept for good.
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }

    private function looksLikeSvg(string $path): bool
    {
        $start = (string) file_get_contents($path, false, null, 0, 4096);

        return (bool) preg_match('/<svg[\s>]/i', $start);
    }

    private function present(BoardImage $image, bool $withBoards = false): array
    {
        return [
            'id' => $image->id,
            'uuid' => $image->uuid,
            'name' => $image->name,
            'mime' => $image->mime,
            'size' => $image->size,
            'url' => $image->url(),
        ] + ($withBoards ? ['boards' => $image->boards()->pluck('name')] : []);
    }
}
