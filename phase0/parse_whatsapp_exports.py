#!/usr/bin/env python3
"""
Parse WhatsApp chat export .txt files into rows for phase0/conversation_log_template.csv.

Populates only the structural columns (customer_ref, conversation_id, channel,
first_message_date, last_message_date, message_count). Classification columns
(conversation_type, intent, status, leakage_type, estimated_value, recoverable,
notes, reviewed_by, review_date) are left blank -- this script only reads
timestamps/senders to count and date-range messages, never message content,
keeping the mechanical parsing step separate from the judgment calls described
in phase0/AUDIT_GUIDE.md.

Each input .txt file is treated as one conversation (WhatsApp's native
"Export Chat" produces one file per chat thread). Supports both iOS
([DD/MM/YYYY, HH:MM:SS AM/PM] Name: message) and Android
(DD/MM/YYYY, HH:MM AM/PM - Name: message) export formats. Dates are parsed
day-first by default (Nigeria locale) -- pass --date-order mdy to override.

Usage:
    python3 parse_whatsapp_exports.py \\
        --business "EXAMPLE Furniture Co" \\
        --input ./raw_exports/ \\
        --output ./conversation_log_template.csv

A separate mapping file (conversation_id -> source filename) is written so you
can trace a row back to the original export during manual classification.
Keep that mapping file access-restricted and do not commit or share it --
see "Data handling" in AUDIT_GUIDE.md. Delete the raw exports once the audit
is complete and confirmed with the business.
"""

import argparse
import csv
import re
import sys
from datetime import datetime
from pathlib import Path

CSV_HEADER = [
    "business_name", "customer_ref", "conversation_id", "channel",
    "first_message_date", "last_message_date", "message_count",
    "conversation_type", "intent", "status", "leakage_type",
    "estimated_value", "recoverable", "notes", "reviewed_by", "review_date",
]

INVISIBLE_MARKS = "‎‏"

IOS_PATTERN = re.compile(
    r"^\[(\d{1,2})/(\d{1,2})/(\d{2,4}),\s(\d{1,2}):(\d{2})(?::(\d{2}))?\s?(AM|PM|am|pm)?\]\s(.+?):\s(.*)$"
)
ANDROID_MESSAGE_PATTERN = re.compile(
    r"^(\d{1,2})/(\d{1,2})/(\d{2,4}),\s(\d{1,2}):(\d{2})\s?(AM|PM|am|pm)?\s-\s(.+?):\s(.*)$"
)
ANDROID_SYSTEM_PATTERN = re.compile(
    r"^(\d{1,2})/(\d{1,2})/(\d{2,4}),\s(\d{1,2}):(\d{2})\s?(AM|PM|am|pm)?\s-\s(.*)$"
)


def strip_invisible(line: str) -> str:
    return "".join(ch for ch in line if ch not in INVISIBLE_MARKS)


def to_datetime(dd, mm, yy, hh, mi, ss, ampm, date_order):
    y = int(yy)
    if y < 100:
        y += 2000
    d, mo = int(dd), int(mm)
    if date_order == "mdy":
        d, mo = mo, d
    hour = int(hh)
    if ampm:
        ampm = ampm.upper()
        if ampm == "PM" and hour != 12:
            hour += 12
        if ampm == "AM" and hour == 12:
            hour = 0
    return datetime(y, mo, d, hour, int(mi), int(ss) if ss else 0)


def parse_export_file(path: Path, date_order: str):
    """Return (first_dt, last_dt, message_count), or None if no messages parsed."""
    first_dt = last_dt = None
    count = 0
    with path.open("r", encoding="utf-8-sig", errors="replace") as f:
        for raw_line in f:
            line = strip_invisible(raw_line.rstrip("\n"))
            if not line.strip():
                continue

            m = IOS_PATTERN.match(line)
            if m:
                dd, mm, yy, hh, mi, ss, ampm, _sender, _text = m.groups()
            else:
                m = ANDROID_MESSAGE_PATTERN.match(line)
                if m:
                    dd, mm, yy, hh, mi, ampm, _sender, _text = m.groups()
                    ss = None
                else:
                    # Either a system/notification line (no sender) or a
                    # continuation of the previous multi-line message.
                    # Neither starts a new message, so skip.
                    continue

            try:
                dt = to_datetime(dd, mm, yy, hh, mi, ss, ampm, date_order)
            except ValueError:
                continue  # malformed timestamp, skip this line rather than abort the file

            if first_dt is None or dt < first_dt:
                first_dt = dt
            if last_dt is None or dt > last_dt:
                last_dt = dt
            count += 1

    if count == 0:
        return None
    return first_dt, last_dt, count


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "business"


def read_csv_rows(path: Path):
    if not path.exists() or path.stat().st_size == 0:
        return []
    with path.open("r", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def next_sequence(existing_ids, slug):
    prefix = f"{slug}-"
    max_n = 0
    for cid in existing_ids:
        if cid.startswith(prefix) and cid[len(prefix):].isdigit():
            max_n = max(max_n, int(cid[len(prefix):]))
    return max_n + 1


def next_customer_index(existing_rows, business_name):
    max_n = 0
    for row in existing_rows:
        if row.get("business_name") == business_name:
            ref = row.get("customer_ref", "")
            if ref.startswith("C") and ref[1:].isdigit():
                max_n = max(max_n, int(ref[1:]))
    return max_n + 1


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--business", required=True, help="Business name, must match business_summary_template.csv")
    parser.add_argument("--input", required=True, type=Path, help="Directory of .txt exports, or a single .txt file")
    parser.add_argument("--output", required=True, type=Path, help="conversation_log_template.csv (or a copy of it) to append to")
    parser.add_argument("--mapping-output", type=Path, default=None,
                         help="Where to write conversation_id -> source filename mapping (default: <output_dir>/_private/customer_mapping.csv)")
    parser.add_argument("--date-order", choices=["dmy", "mdy"], default="dmy",
                         help="Day-first (Nigeria default) or month-first date parsing")
    args = parser.parse_args()

    if args.input.is_dir():
        files = sorted(p for p in args.input.iterdir() if p.suffix.lower() == ".txt")
    elif args.input.is_file():
        files = [args.input]
    else:
        print(f"error: {args.input} not found", file=sys.stderr)
        sys.exit(1)

    if not files:
        print(f"error: no .txt files found in {args.input}", file=sys.stderr)
        sys.exit(1)

    mapping_output = args.mapping_output or (args.output.parent / "_private" / "customer_mapping.csv")
    mapping_output.parent.mkdir(parents=True, exist_ok=True)

    existing_rows = read_csv_rows(args.output)
    existing_ids = {row["conversation_id"] for row in existing_rows if row.get("conversation_id")}
    already_mapped_files = set()
    if mapping_output.exists():
        for row in read_csv_rows(mapping_output):
            already_mapped_files.add((row.get("business_name"), row.get("source_filename")))

    slug = slugify(args.business)
    seq = next_sequence(existing_ids, slug)
    customer_n = next_customer_index(existing_rows, args.business)

    new_rows = []
    new_mapping_rows = []
    skipped_empty = []
    skipped_duplicate = []

    for path in files:
        if (args.business, path.name) in already_mapped_files:
            skipped_duplicate.append(path.name)
            continue

        result = parse_export_file(path, args.date_order)
        if result is None:
            skipped_empty.append(path.name)
            continue

        first_dt, last_dt, count = result
        conversation_id = f"{slug}-{seq:03d}"
        customer_ref = f"C{customer_n}"
        seq += 1
        customer_n += 1

        new_rows.append({
            "business_name": args.business,
            "customer_ref": customer_ref,
            "conversation_id": conversation_id,
            "channel": "WhatsApp",
            "first_message_date": first_dt.isoformat(sep=" "),
            "last_message_date": last_dt.isoformat(sep=" "),
            "message_count": count,
            "conversation_type": "",
            "intent": "",
            "status": "",
            "leakage_type": "",
            "estimated_value": "",
            "recoverable": "",
            "notes": "",
            "reviewed_by": "",
            "review_date": "",
        })
        new_mapping_rows.append({
            "conversation_id": conversation_id,
            "business_name": args.business,
            "source_filename": path.name,
        })

    write_header = not args.output.exists() or args.output.stat().st_size == 0
    with args.output.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADER)
        if write_header:
            writer.writeheader()
        writer.writerows(new_rows)

    mapping_write_header = not mapping_output.exists() or mapping_output.stat().st_size == 0
    with mapping_output.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["conversation_id", "business_name", "source_filename"])
        if mapping_write_header:
            writer.writeheader()
        writer.writerows(new_mapping_rows)

    print(f"Parsed {len(new_rows)} conversation(s) for '{args.business}' -> {args.output}")
    if skipped_empty:
        print(f"Skipped {len(skipped_empty)} file(s) with no parseable messages: {', '.join(skipped_empty)}")
    if skipped_duplicate:
        print(f"Skipped {len(skipped_duplicate)} file(s) already parsed in a previous run: {', '.join(skipped_duplicate)}")
    print(f"Mapping (conversation_id -> source filename) written to {mapping_output}")
    print("Reminder: keep the mapping file access-restricted and do not share/commit it; "
          "delete raw exports once the audit is confirmed with the business (see AUDIT_GUIDE.md).")
    print("Classification columns (conversation_type, intent, status, leakage_type, "
          "estimated_value, recoverable, notes) are blank -- fill these in manually per AUDIT_GUIDE.md.")


if __name__ == "__main__":
    main()
