"""
Audit and clean rife_library.json
Fixes:
1. Condition names that are actually frequency data (numbers, commas, dots, =)
2. Notes that contain frequency data mixed in
3. Truncated/malformed descriptions
"""
import json
import re

INPUT = r"c:\Users\yoga\OneDrive\Resonate Freq Proj\companion_app\rife_library.json"
OUTPUT = r"c:\Users\yoga\OneDrive\Resonate Freq Proj\companion_app\rife_library_cleaned.json"
REPORT = r"c:\Users\yoga\OneDrive\Resonate Freq Proj\companion_app\audit_report.txt"

# Pattern: looks like frequency data (numbers, commas, dots, equals, spaces, Hz)
FREQ_PATTERN = re.compile(r'^[\d\.,=\s]+$')
# Pattern: starts with frequency-like data (number at the start followed by comma/equals)
FREQ_START_PATTERN = re.compile(r'^[\d\.,=\s]{5,}')
# Pattern: contains mostly numbers (>60% digits/commas/dots/equals)
def is_mostly_freq(text):
    if not text:
        return False
    freq_chars = sum(1 for c in text if c in '0123456789.,= ')
    return freq_chars / len(text) > 0.6

def extract_freqs_from_text(text):
    """Extract frequency-like numbers from mixed text, return (freqs, remaining_text)"""
    # Find sequences of numbers separated by commas
    freq_matches = re.findall(r'[\d]+\.?\d*(?:=\d+)?', text)
    # Remove those from the text to get clean description
    remaining = text
    for match in freq_matches:
        remaining = remaining.replace(match, '')
    # Clean up remaining text
    remaining = re.sub(r'[,\s]+', ' ', remaining).strip()
    remaining = re.sub(r'^\s*[,.\s]+', '', remaining)
    remaining = re.sub(r'[,.\s]+\s*$', '', remaining)
    
    freqs = ','.join(freq_matches)
    return freqs, remaining

with open(INPUT, 'r', encoding='utf-8') as f:
    data = json.load(f)

report_lines = []
report_lines.append(f"RIFE LIBRARY AUDIT REPORT")
report_lines.append(f"Total entries: {len(data)}")
report_lines.append(f"{'='*60}\n")

issues_found = 0
bad_conditions = 0
freq_in_notes = 0
truncated_notes = 0
cleaned = []

for i, entry in enumerate(data):
    condition = entry.get('condition', '')
    notes = entry.get('notes', '')
    freqs = entry.get('frequencies', '')
    source = entry.get('source', '')
    issues = []
    
    # ISSUE 1: Condition is actually frequency data
    if FREQ_PATTERN.match(condition) or is_mostly_freq(condition):
        extracted_freqs, remaining_text = extract_freqs_from_text(condition)
        if remaining_text and len(remaining_text) > 3:
            entry['condition'] = remaining_text
        else:
            # No real condition name — try to use organ or notes for name
            if entry.get('organ'):
                entry['condition'] = entry['organ']
            elif notes and len(notes) > 5:
                # Use first meaningful part of notes as condition
                words = notes.split()
                # Find the first non-numeric word
                name_words = []
                for w in words:
                    if not re.match(r'^[\d\.,=]+$', w):
                        name_words.append(w)
                    if len(name_words) >= 5:
                        break
                entry['condition'] = ' '.join(name_words) if name_words else f"Entry {i+1}"
            else:
                entry['condition'] = f"Unidentified Entry {i+1}"
        
        # Merge the extracted freqs into the frequencies field
        if extracted_freqs:
            if freqs:
                entry['frequencies'] = freqs + ',' + extracted_freqs
            else:
                entry['frequencies'] = extracted_freqs
        
        issues.append(f"BAD CONDITION: '{condition}' -> '{entry['condition']}'")
        bad_conditions += 1
    
    # ISSUE 2: Frequencies mixed into notes
    if notes:
        # Check if notes start with frequency-like data
        freq_prefix = FREQ_START_PATTERN.match(notes)
        if freq_prefix:
            extracted, clean_notes = extract_freqs_from_text(notes)
            if extracted:
                if entry['frequencies']:
                    entry['frequencies'] += ',' + extracted
                else:
                    entry['frequencies'] = extracted
                entry['notes'] = clean_notes
                issues.append(f"FREQS IN NOTES: extracted '{extracted[:50]}...'")
                freq_in_notes += 1
        
        # Check if notes seem truncated (start with lowercase, very short, start with punctuation)
        clean_note = entry['notes'].strip()
        if clean_note and (clean_note[0].islower() or clean_note[0] in '.,;:'):
            issues.append(f"TRUNCATED NOTES: '{clean_note[:80]}...'")
            # Capitalize first letter as a basic fix
            entry['notes'] = clean_note[0].upper() + clean_note[1:] if len(clean_note) > 1 else clean_note.upper()
            truncated_notes += 1
    
    # ISSUE 3: Clean up frequency field - remove non-numeric junk
    if entry['frequencies']:
        # Remove any text that leaked in, keep only numbers, commas, dots
        clean_freq = re.sub(r'[^0-9.,]', ',', entry['frequencies'])
        clean_freq = re.sub(r',+', ',', clean_freq).strip(',')
        entry['frequencies'] = clean_freq
    
    if issues:
        issues_found += len(issues)
        report_lines.append(f"ENTRY {i+1}: {entry['condition']}")
        for issue in issues:
            report_lines.append(f"  - {issue}")
        report_lines.append("")
    
    cleaned.append(entry)

# Remove entries with no real condition name or no frequencies
final = [e for e in cleaned if e.get('frequencies') and len(e.get('condition', '')) > 2]

# Re-sort
final.sort(key=lambda x: x['condition'].lower())

report_lines.append(f"\n{'='*60}")
report_lines.append(f"SUMMARY:")
report_lines.append(f"  Bad condition names (were freq data): {bad_conditions}")
report_lines.append(f"  Frequencies found in notes: {freq_in_notes}")
report_lines.append(f"  Truncated/malformed notes: {truncated_notes}")
report_lines.append(f"  Total issues fixed: {issues_found}")
report_lines.append(f"  Entries before: {len(data)}")
report_lines.append(f"  Entries after: {len(final)}")

with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(final, f, indent=4)

with open(REPORT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(report_lines))

print('\n'.join(report_lines[-8:]))
