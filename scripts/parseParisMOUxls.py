#!/usr/bin/env python3
"""Parse a Paris MOU Detention List XLS file and print newline-delimited JSON."""
import sys, json, datetime
import xlrd

def to_date(v):
    if not v: return None
    try:
        t = xlrd.xldate_as_tuple(float(v), 0)
        if t[0] < 1990 or t[0] > 2035: return None
        return str(datetime.date(t[0], t[1], t[2]))
    except:
        return None

def to_imo(v):
    if not v: return None
    try:
        i = int(float(v))
        return str(i) if 7_000_000 <= i <= 9_999_999 else None
    except:
        return None

def clean(v):
    return str(v).strip() if v else ''

if len(sys.argv) < 2:
    sys.stderr.write('Usage: parseParisMOUxls.py <file.xls>\n')
    sys.exit(1)

try:
    wb = xlrd.open_workbook(sys.argv[1])
except Exception as e:
    sys.stderr.write(f'Failed to open workbook: {e}\n')
    sys.exit(1)

sh = wb.sheet_by_index(0)

for r in range(1, sh.nrows):
    row = sh.row_values(r)
    if len(row) < 14:
        continue

    imo       = to_imo(row[3])
    name      = clean(row[5])
    insp_date = to_date(row[7])
    port      = clean(row[13])
    flag      = clean(row[10])

    # Skip rows missing any required field
    if not (imo and name and insp_date and port):
        continue

    print(json.dumps({
        'imo':         imo,
        'vessel_name': name,
        'event_date':  insp_date,
        'location':    port,
        'flag':        flag,
    }))
