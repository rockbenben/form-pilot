# Job-board field coverage

A record of which recruiting sites have actually been inspected against
`lib/engine/heuristic/patterns.ts`, so the next person knows what is evidence
and what is still an assumption.

**Status: 3 of 3 target sites verified.** 猎聘, 智联招聘 and BOSS 直聘 were
each inspected on a live logged-in form. Every pattern below was added only
after seeing a control actually carry that wording — guessing at field names
would put unverifiable rules into the matcher, which is worse than an
acknowledged gap.

## Method

Open the site's resume form, reveal the fields (these pages render read-only
until an edit control is clicked), and read each control's `id`, `name`,
`placeholder`, and resolved label — structure only, never values. Then check
each against `PATTERNS`.

## 猎聘 — `c.liepin.com/resume/edit`, basic-info section

16 controls. Verified 2026-07-29.

| Control | Identified by | Matches today |
|---|---|---|
| `realName` | id | ✅ `basic.name` — `real[\s_-]?name` |
| radio 男 / 女 | label | ✅ `basic.gender` |
| `birthday` | label 出生日期 | ✅ `basic.birthday` |
| `politicalStatusCode` | label 政治面貌 | ✅ `basic.politicalStatus` |
| email field | placeholder 用于接收面试邮件 | ✅ **fixed** — the list required 邮箱 / 电子邮件 / 邮件地址 and matched nothing; widened to 邮件 |
| city (antd Select) | — | ❌ **unmatchable by pattern** — see below |
| `nowSalary`, `nowSalaryMonths` | placeholder 月薪 / 月数 | ❌ current salary — no such field in `Resume` |
| `workStatusCode` | label 目前状态 | ❌ job-seeking status — no such field |
| `wechat` | label 微信号 | ❌ no such field |

### The city field cannot be matched by a pattern

Settled by replicating `findLabelText` in the page and running it against the
live control.

The city field is an antd `Select` whose input is `rc_select_0`. It has no
`name`, no `placeholder`, no `aria-label`, and its auto-generated id has no
`[for]` pointing at it. Seven levels of ancestors contain no `<label>` at all —
the form has sixteen of them, none associated with this control.

What `findLabelText` returns is **`上海`** — the currently selected *value*,
picked up by the `findGroupHeading` fallback from the nearest preceding
sibling, because antd renders the chosen option there. A value is worse than an
empty label: it matches no `basic.location` pattern and never will, since it
changes with the user's own data.

An earlier attempt to add an ancestor-wrapper label lookup would not have
helped either — a replica of it returns empty for this control too, which is
the second reason that change was right to revert.

**Conclusion: no pattern can reach this field — and no adapter can either.**

A site adapter was written for exactly this and then **reverted**, because the
live DOM contradicted the premise it was built on.

The design read a field's label off its form-item container, which is what a
site-aware scan can do and a generic heuristic cannot. Against a synthetic
reproduction of antd markup it worked, with tests covering nested containers,
multi-control containers and the colon stripping. Run against the real page it
returned **zero** mappings: 猎聘 uses antd's form-item wrappers but not its
label cells, so all fifteen `.ant-form-item` containers hold no `<label>` at
all, and no element anywhere on the page has the text 姓名. The labels the
generic heuristic does find on this form come from ids and group headings, not
from form-items.

So the adapter would have intercepted the host and returned nothing. That is
harmless — `scanFields` falls back to the heuristic for anything an adapter
does not claim — but it is dead weight, and shipping code whose premise the
target site disproves is worse than shipping nothing.

The same reasoning rules adapters out for the other two boards: an adapter only
earns its place where the heuristic fails, and every field surveyed on 智联招聘
and BOSS 直聘 already matches through a placeholder or an id.

What would actually reach the city field is a positional rule — "the
`ant-select` inside `span.suggest-component-items` is the city" — keyed to one
version of one page's markup. That is a maintenance liability, not a fix, and
it is not being added on the strength of a single field.

## 智联招聘 — `i.zhaopin.com/resume`

Verified 2026-07-29.

The page renders read-only with 21 controls, none of which is a resume field —
they are the search boxes inside its job-preference picker modals, plus a
site-wide search box. The activation gate correctly stays silent there.
Clicking the section's edit control brings the count to 41 and **the toolbar
mounts on its own**, which is the late-form watcher in `entrypoints/content.ts`
working on a second site independently of 猎聘.

| Control | Identified by | Matches today |
|---|---|---|
| name | label `姓名:` | ✅ via the unanchored `姓\s*名` |
| birthday | label `出生年月:` | ✅ **fixed** — shares no substring with 出生日期 / 生日, so it matched nothing |
| 参加工作时间 | label | ❌ first-employment date — no such field in `Resume` |
| 全职 / 兼职 / 实习 | checkbox labels | partial — `jobPreference.jobType` exists but these are checkboxes, not a single value |
| 职位类别 / 行业类别 / 城市 | picker modals | ❌ the visible input is the picker's own search box, not the field |

### Trailing punctuation on labels

Every 智联 label ends in a colon, and required fields are marked with an
asterisk. Many entries in `PATTERNS` are anchored, so a colon alone makes them
miss: `名字` matches `basic.name`, `名字:` does not. Only wordings that happened
to have an unanchored sibling pattern were surviving.

Labels are now stripped of leading and trailing markers in
`lib/engine/heuristic/signals.ts`, which fixes every anchored pattern at once.
This is deliberately **not** done inside `findLabelText`, because that feeds
`computeSignatureFor` — changing its output would invalidate every cross-URL
form entry users have already saved.

## BOSS 直聘 — `www.zhipin.com/web/geek/resume`

Verified 2026-07-29. The page renders read-only with 9 controls; each section's
edit control is an `a.link-edit` that only becomes visible on hover. Opening
个人信息 brings the count to 19.

| Control | Identified by | Matches today |
|---|---|---|
| name | label 姓名, placeholder 请输入您的姓名 | ✅ `basic.name` |
| radio 男 / 女 | group heading 性别, four levels up | ✅ `basic.gender` |
| birthday | label 出生年月, placeholder 请选择出生年月 | ✅ — the same wording 智联 uses, and the reason the pattern was added |
| phone | label 电话, placeholder 请输入您的手机号 | ✅ `basic.phone` |
| email | label 邮箱 (选填), placeholder 请输入您的邮箱 | ✅ `basic.email` |
| 参加工作时间 | label | ❌ no such field in `Resume` |
| 微信号 | placeholder 请输入您的微信号 | ❌ no such field |

That 出生年月 turned up independently on two of the three boards is the
strongest evidence in this document that the pattern addition was right, rather
than a one-site special case.

### It sits right on the threshold — and a stale build proved it

The toolbar did not mount when this modal opened, and the cause turned out to
be arithmetic plus a stale build.

The obvious suspects were ruled out first: the content script is alive on the
page (an injected form block mounts the toolbar within four seconds), the
mutation observer would fire (of 54 element nodes added when the modal opens,
five contain form controls), the group heading for the gender radios resolves
to 性别 within the depth limit, and it is not a timing race — the field count
reaches its final value inside one second and the toolbar was still absent
fourteen seconds later.

That left the count. This modal offers exactly five distinct resume paths —
name, gender, birthday, phone, email — against a threshold of five, so any one
of them failing to match drops it below the bar. The Chrome profile was running
a build from before 出生年月 was added to the birthday patterns, which removed
one path and left four.

**Confirmed after reloading the extension: the toolbar mounts within one second
of the modal opening.** Nothing needed changing, and the threshold was rightly
left alone — lowering `RESUME_FIELD_THRESHOLD` to 4 would have traded a working
form for false positives on every registration page that asks name, email,
phone and city.

The practical lesson is procedural: **an unpacked extension does not pick up a
rebuild on its own.** Reload it in `chrome://extensions` after every `yarn
build`, or spend an hour chasing a bug that is not in the code.

## Fields the survey added to `Resume`

Each of these turned up on a live form during the survey and now has a matcher
pattern, a Dashboard field and an import path. A field that imports empty and
can only be typed by hand is no better than not having it — the fill would
still report it missing.

| Field | Seen on | Note |
|---|---|---|
| `basic.workStartDate` | 智联, BOSS | Both ask when you started working and derive the years from it |
| `basic.currentSalary` | 猎聘 | Separate from `jobPreference.salaryRange`, which is what you are asking for next |
| `basic.jobStatus` | 猎聘 | 在职 / 离职 / 随时到岗 |
| `basic.socialLinks.wechat` | 猎聘, BOSS | Routed into the existing free-form `socialLinks` map |

### The salary trap

`jobPreference.salaryRange` already claims 薪资, and 智联 labels its
expected-salary field **期望月薪**. A current-salary pattern matching a bare
月薪 would silently route the expected salary into the current one — the user
would see a plausible value in the wrong box and have no reason to doubt it.
The pattern therefore requires a 当前 / 目前 / 现 / 税前 qualifier, and a test
pins 期望薪资, 期望月薪 and 薪资要求 as wordings that must not match.

## Still with no home in `Resume`

- household registration (户口) — seen in resume text, not yet on a form
- 全职 / 兼职 / 实习 as checkboxes: `jobPreference.jobType` is a single string,
  while 智联 presents them as a multi-select

## Adding a site

1. Inspect the live form and record a table like the ones above — do not work
   from memory.
2. Add only patterns you have seen a control actually carry.
3. Add a test in `tests/lib/engine/heuristic.test.ts` for the new wording, plus
   a negative case for the nearest thing that must NOT match. Widening a
   pattern is the easiest way to create silent false positives — 邮件 needed
   公司邮编 and 邮寄地址 pinned as counter-examples.
