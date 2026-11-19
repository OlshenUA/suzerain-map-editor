# Знімки для довідки

Довідка («?») показує знімки редактора з `img/help/<назва>.<uk|en>.jpg`. Після змін в інтерфейсі їх варто перезняти.

У редакторі є прихований режим знімків: `?shot=<назва>&lang=<uk|en>`. Він пропускає стартовий екран, нічого не зберігає й готує потрібний стан:

| назва | що на знімку |
|---|---|
| `overview` | загальний вигляд: вибраний ліс, ліва й права панелі |
| `brush` | пензель, ландшафт «Сніг», мазок і курсор |
| `ai` | порівняння змін ШІ з підсвічуванням і списком |

Запустіть локальний сервер (`py -m http.server 8765` у теці проєкту) і в Git Bash виконайте:

```bash
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
for shot in overview brush ai; do for l in uk en; do
  "$CH" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --user-data-dir="$TEMP/suzerain-shot-$shot-$l" --window-size=1280,760 --virtual-time-budget=20000 \
    --screenshot="$(cygpath -w "$PWD/img/help/$shot.$l.jpg")" "http://localhost:8765/?shot=$shot&lang=$l"
done; done
```

Окремий профіль (`--user-data-dir`) потрібен, щоб знімки не залежали від мап і мови у вашому браузері. Новий стан для знімка додається у функцію `setupShot()` в `js/ui.js`.
