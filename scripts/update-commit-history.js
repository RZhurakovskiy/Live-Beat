// Обновляет plans/archive/commit-history.md: тексты всех коммитов по порядку, дословно.
// Читает только git и пишет только этот один файл. Запускается из любой папки:
//
//   node scripts/update-commit-history.js
//   node scripts/update-commit-history.js --pending сообщение.txt
//
// С `--pending` в конец списка добавляется коммит, которого ещё нет: его текст берётся из
// файла, того же, что передают в `git commit -F`. Так обновлённый файл попадает в тот же
// коммит, что и запись о нём самом, и не отстаёт на один коммит. У такой записи вместо хэша
// стоит «этот коммит»: хэш неизвестен, пока коммит не создан. При следующем запуске запись
// заменится настоящей.
//
// Правило 14 в plans/conventions-and-status.md: файл обновляется в каждом коммите.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const outFile = path.join(repo, 'plans', 'archive', 'commit-history.md');

function git(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 });
}

const pad = (n) => String(n).padStart(2, '0');

/** Дата и время вида «02.10.2026 14:35» по местному времени компьютера. */
function formatNow() {
  const d = new Date();
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Текст сообщения так, как его сохранит `git commit -F`: без пробелов в конце строк, без
 * пустых строк в начале и в конце, подряд идущие пустые строки схлопнуты в одну.
 */
function cleanMessage(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  const out = [];
  for (const line of lines) {
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

const args = process.argv.slice(2);
const pendingAt = args.indexOf('--pending');
let pending = null;
if (pendingAt >= 0) {
  const file = args[pendingAt + 1];
  if (!file) {
    console.error('После --pending нужен путь к файлу с текстом коммита.');
    process.exit(1);
  }
  const message = cleanMessage(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'));
  if (!message) {
    console.error('Файл с текстом коммита пуст.');
    process.exit(1);
  }
  pending = { short: 'этот коммит', date: formatNow(), message, subject: message.split('\n')[0] };
}

const raw = git('log', '--topo-order', '--reverse', '--date=format:%d.%m.%Y %H:%M', '--format=%H%x1f%h%x1f%ad%x1f%B%x1e');
const commits = raw
  .split('\x1e')
  .map((r) => r.replace(/^\n+/, ''))
  .filter((r) => r.trim().length > 0)
  .map((r) => {
    const [hash, short, date, ...rest] = r.split('\x1f');
    const message = rest.join('\x1f').replace(/\r\n/g, '\n').replace(/\s+$/, '');
    return { hash, short, date, message, subject: message.split('\n')[0] };
  });
if (pending) commits.push(pending);

const zones = new Set(git('log', '--format=%ad', '--date=format:%z').split('\n').filter(Boolean));
const tzNote =
  zones.size === 1 && zones.has('+0300')
    ? 'указано по Москве (UTC+3)'
    : 'указано по часовому поясу автора коммита (в основном UTC+3)';

const first = commits[0];
const last = commits[commits.length - 1];

/** Ограждение из обратных кавычек длиннее любой серии внутри текста, чтобы текст не ломал блок. */
function fenceFor(text) {
  const runs = text.match(/`+/g) || [];
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

const lines = [];
lines.push('# История коммитов: тексты по порядку');
lines.push('');
lines.push(
  'Тексты всех коммитов репозитория `github.com/RZhurakovskiy/Live-Beat` по порядку: ' + commits.length +
    ' коммитов, с ' + first.date.slice(0, 10) + ' по ' + last.date.slice(0, 10) + '. Файл обновляется с каждым ' +
    'коммитом (правило 14 в `plans/conventions-and-status.md`), состояние на ' + formatNow().slice(0, 10) + '.',
);
lines.push('');
lines.push(
  '**Зачем файл.** Старый репозиторий планируется заменить новым, и вместе с ним уйдёт история git. ' +
    'Этот файл сохраняет из неё главное: что делали, в каком порядке и по какой причине. ' +
    'По текстам коммитов можно восстановить ход проекта, не имея самой истории.',
);
lines.push('');
lines.push('## Как читать');
lines.push('');
lines.push('- **Порядок:** от самого старого коммита к самому новому. Номер в заголовке это порядковый номер в этом списке.');
lines.push(
  '- **Тексты дословные:** заголовок и описание ровно как в git, в том числе с длинными тире. Пометка `[skip ci]` ' +
    'встроена в GitHub Actions и значит: сборку этим коммитом не запускать (так помечали коммиты, где менялись только документы).',
);
lines.push(
  '- **Хэши** принадлежат старому репозиторию, в новом их не найти. Оставлены только для различения коммитов между собой. ' +
    'У последней записи вместо хэша стоит «этот коммит»: файл пишется до самого коммита, настоящий хэш появится при следующем обновлении.',
);
lines.push('- **Время** ' + tzNote + '.');
lines.push('- **Файлов и диффов здесь нет,** только тексты. Что именно менялось, видно в самом коде и в документах `plans/`.');
lines.push(
  '- **Упомянутые в текстах файлы могли переехать.** Например, `plans/field-fixes.md` теперь лежит в ' +
    '`plans/archive/field-fixes.md`. Актуальный порядок документов в `plans/README.md`.',
);
lines.push(
  '- **Имена.** Ранние коммиты называют приложение Pulse, позже оно переименовано в LiveBeat. Репозиторий раньше назывался ' +
    '`magene-app-expo-react-native`, теперь `Live-Beat`.',
);
lines.push('');
lines.push('## Как в проекте пишут сообщения коммитов');
lines.push('');
lines.push('- Основной язык русский. В самых ранних коммитах встречается английский и префиксы `feat:` и `fix:`.');
lines.push(
  '- Заголовок говорит, что изменилось. Описание объясняет, зачем и по какой причине, часто со ссылкой на пункт ' +
    'из `plans/archive/field-fixes.md`.',
);
lines.push('- Коммиты, где менялись только документы, начинаются с `plans:`.');
lines.push(
  '- **Никакой атрибуции ИИ в коммитах:** ни `Co-Authored-By`, ни `Generated with`. Это жёсткое правило владельца ' +
    '(`plans/conventions-and-status.md`, правило 1).',
);
lines.push('');
lines.push('## Как обновлять этот файл');
lines.push('');
lines.push(
  'В каждом коммите, в том числе документном: записать сообщение коммита в файл, выполнить ' +
    '`node scripts/update-commit-history.js --pending <файл>`, добавить `plans/archive/commit-history.md` в тот же ' +
    'коммит и создать его через `git commit -F <файл>`. Без `--pending` скрипт просто пересобирает файл из `git log`.',
);
lines.push('');
lines.push('## Оглавление по дням');
lines.push('');

let currentDay = '';
commits.forEach((c, i) => {
  const day = c.date.slice(0, 10);
  if (day !== currentDay) {
    currentDay = day;
    if (i > 0) lines.push('');
    lines.push('**' + day + '**');
    lines.push('');
  }
  lines.push(i + 1 + '. ' + c.date.slice(11) + ' · `' + c.short + '` · ' + c.subject);
});

lines.push('');
lines.push('## Тексты коммитов');
commits.forEach((c, i) => {
  const fence = fenceFor(c.message);
  lines.push('');
  lines.push('### ' + (i + 1) + '. ' + c.date + ' · `' + c.short + '`');
  lines.push('');
  lines.push(fence + 'text');
  lines.push(c.message);
  lines.push(fence);
});

fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');

console.log(
  'коммитов в файле:', commits.length, pending ? '(последний ещё не создан)' : '',
  '| первый:', first.short, first.date, '| последний:', last.short, last.date,
);
