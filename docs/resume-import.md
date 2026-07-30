# Resume import: what it extracts, and what it doesn't

Importing a PDF or Word resume is a **best-effort** step. There is no resume
standard — every job board and every template lays the same facts out
differently — so extraction is heuristic and its results vary by file. This
document is an honest account of where the line currently falls, so nobody has
to guess whether an empty field is a bug or a limit.

**The import is a head start, not a substitute for review.** Always open the
Dashboard afterwards and check what landed.

## Pipeline

```
file → format sniff → text extraction → line reconstruction → field extraction
```

| Stage | Module |
|---|---|
| Format sniff | `lib/import/word-parser.ts` (magic bytes, not the file extension) |
| PDF text + lines | `lib/import/pdf-parser.ts` |
| Field extraction | `lib/import/resume-extractor.ts` |

## Supported formats

| Magic bytes | Format | Handling |
|---|---|---|
| `%PDF` | PDF | pdfjs text layer, lines rebuilt from `hasEOL` + baseline Y |
| `50 4b` | `.docx` (OOXML zip) | mammoth |
| `3c 68 74 6d` … | Word-exported HTML named `.doc` | tag stripper, Office `<head>` metadata dropped first |
| `d0 cf 11 e0` | pre-2007 binary `.doc` (OLE2) | **not supported** — the user is told to re-save as `.docx` or PDF |

The extension of a file says nothing about its contents. Chinese job boards
routinely export Word-flavoured HTML under a `.doc` name, which is why the
format is sniffed rather than trusted.

**Scanned/image-only PDFs extract nothing.** There is no OCR. If a PDF has no
text layer, import produces an empty profile — that is expected, not a failure
to diagnose.

## What extracts reliably

- **Email, phone** — whole-text patterns, independent of layout. The most
  robust fields by a wide margin.
- **Name** — the leading Han run of an early line, so a header reading
  `张明远 男 · 32 岁 · 杭州 · 本科` yields `张明远`. Latin names must be
  capitalised, which is what keeps a lowercase handle from being mistaken for
  one.
- **Gender** — a labelled `性别：` value, or a bare 男/女 token in the header.
- **Labelled facts** — anything written as `标签：值`, inline or with the value
  wrapped onto the next line: 现居住地, 出生日期, 民族, 政治面貌, 求职意向,
  期望薪资, 期望城市 and their common synonyms.

## What extracts unevenly

- **Work and project entries.** An entry is recognised by its date range —
  the one structural marker every layout shares. Company/project name, title
  and dates come from the entry header; the description is everything up to the
  next entry. This works well when the header reads
  `公司名 职位 2019.03-至今`, and also when the date sits on its own line
  beneath the name. It degrades when a layout interleaves the name, title and
  dates in some other order, in which case the name/title split can be wrong
  even though the dates and description are right.
- **Education.** School names are matched by shape — anything ending in
  大学 / 学院 / 职业技术学院 / 中学 and the Latin equivalents — rather than
  against a fixed list. Degree extraction is keyword-based. Major is frequently
  missed, and a stray 本科 on its own line can produce a thin entry with only a
  degree.

## What is not extracted

| Not extracted | Why |
|---|---|
| Birthday derived from an age | `39 岁` gives a birth year that is wrong for most of the year. A guess written into the profile reads as fact, so only an explicit date counts. |
| City from an unlabelled header | In `保密 · 上海 · 本科 · 群众` nothing marks 上海 as the city. Identifying it needs a place-name list, which is the same unmaintainable trap the old 28-university list was. |
| `nameEn`, `nationality`, `avatar`, social links | Rarely present in a machine-readable form. |
| Certificates, honours, tech stack, industries, job type | No stable textual marker. |
| Skills beyond the built-in dictionary | `resume-extractor.ts` scans for a fixed list of languages and tools. Anything outside it is missed — this list *is* maintainable, so extending it is a reasonable contribution. |
| Masked values | Boards export `135****3382`. The digits are gone from the file; nothing can recover them. |

## Measured coverage

Three real resumes, three different producers:

| Field | Résumé A (PDF) | Résumé B (PDF) | Résumé C (board HTML) |
|---|---|---|---|
| name / email / phone | ✅ / ✅ / ✅ | ✅ / ✅ / ✅ | ✅ / — / — (masked in source) |
| gender | ✅ | ✅ | ✅ |
| birthday | ✅ | — | ✅ |
| location | — | — | ✅ |
| job preference | ✅ | — | ✅ |
| work entries | 5 | 1 | 3 |
| project entries | 2 | 1 | 4 |
| education entries | 0 | 2 | 2 |

The spread across three files of the same person is the honest picture: layout
decides how much survives. Nothing here is a substitute for reviewing the
imported profile.

## Extending it

Add a label synonym to `LABEL_MAP`, a school suffix to `KNOWN_SCHOOLS_RE`, or a
skill to the dictionaries in `resume-extractor.ts`. Prefer patterns that
generalise by shape over lists of specific names — the 28-university list this
code used to carry is exactly the failure mode to avoid.

Every change here needs a test in `tests/lib/import/resume-extractor.test.ts`.
Use synthetic data; never commit a real resume's contents.
