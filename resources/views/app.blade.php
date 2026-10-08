<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="{{ csrf_token() }}">
  {{-- Who is signed in, for the top bar. Empty on a screen, which nobody signs in to. --}}
  <meta name="user-name" content="{{ auth()->user()?->name }}">
  <title>{{ config('app.name') }}</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  @viteReactRefresh
  @vite(['resources/js/main.tsx', 'resources/css/app.css'])
</head>

<body>
  <div id="root"></div>
</body>

</html>
