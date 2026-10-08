<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in · {{ config('app.name') }}</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #2a2b2e; color: #ddd; }
    main { width: min(360px, 100% - 32px); }
    h1 { margin: 0 0 4px; font-size: 22px; }
    p.lede { margin: 0 0 24px; color: #aaa; }
    form { display: flex; flex-direction: column; gap: 14px; }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
    label.check { flex-direction: row; align-items: center; gap: 8px; }
    input[type="email"], input[type="password"] { font: inherit; padding: 8px 10px; background: #1b1c1e; color: inherit; border: 1px solid #444; border-radius: 6px; }
    button { font: inherit; padding: 9px 12px; background: #2d5bd1; border: 1px solid #3a68df; color: #fff; border-radius: 6px; cursor: pointer; }
    button:hover { background: #3a68df; }
    .error { margin: 0; padding: 10px 14px; border-radius: 6px; background: #3a1f1c; color: #ffb4a8; font-size: 14px; }
  </style>
</head>

<body>
  <main>
    <h1>{{ config('app.name') }}</h1>
    <p class="lede">Sign in to set up boards.</p>

    <form method="POST" action="{{ route('login') }}">
      @csrf
      @if ($errors->any())
        <p class="error">{{ $errors->first() }}</p>
      @endif
      <label>
        Email
        <input type="email" name="email" value="{{ old('email') }}" autocomplete="username" required autofocus>
      </label>
      <label>
        Password
        <input type="password" name="password" autocomplete="current-password" required>
      </label>
      <label class="check">
        <input type="checkbox" name="remember" value="1" @checked(old('remember'))>
        Keep me signed in on this computer
      </label>
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>

</html>
