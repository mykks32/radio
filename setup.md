# Radio Setup (Icecast on macOS)

## 1. Install

```bash
brew install icecast
```

## 2. Fix MIME Types

```bash
sudo vim /opt/homebrew/etc/mime.types
```

Paste:

```
audio/mpeg  mp3
audio/aac   aac
audio/ogg   ogg
audio/wav   wav
```

## 3. Configure `icecast.xml`

```bash
vim /opt/homebrew/etc/icecast.xml
```

Change passwords and add the MIME path:

```xml
<source-password>your_password</source-password>
<admin-password>your_admin_password</admin-password>

<mimetypes>/opt/homebrew/etc/mime.types</mimetypes>
```

## 4. Create Log Directory

```bash
mkdir -p /opt/homebrew/var/log/icecast
```

## 5. Start

```bash
brew services start icecast
```

Check it's running → `http://localhost:8000`

## 6. Connect a Source Client

Push audio in using **BUTT** (live) or **Liquidsoap** (playlist).

- Host: `localhost` · Port: `8000`
- Password: *(your source password)*
- Mount: `/stream.mp3`

Listen at → `http://localhost:8000/stream.mp3`