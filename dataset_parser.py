import csv
import json
import io
import re
from typing import Optional

def parse_csv_dataset(file_content: str, prompt_col_hint: Optional[str] = None) -> dict:
    """
    Parses a CSV formatted dataset and auto-detects prompt, category, and expected answer columns.
    Allows overriding the prompt column using prompt_col_hint.
    """
    f = io.StringIO(file_content.strip())
    reader = csv.reader(f)
    try:
        headers = next(reader)
    except StopIteration:
        return {
            'prompts': [],
            'total': 0,
            'detected_columns': {'prompt_col': None, 'category_col': None, 'answer_col': None},
            'errors': ['Empty CSV file']
        }

    # Clean headers
    headers = [h.strip() for h in headers]
    headers_lower = [h.lower() for h in headers]

    # Detect Prompt column
    prompt_col = None
    prompt_idx = -1
    if prompt_col_hint:
        # Try exact match first, then case-insensitive
        if prompt_col_hint in headers:
            prompt_idx = headers.index(prompt_col_hint)
            prompt_col = prompt_col_hint
        else:
            hint_lower = prompt_col_hint.lower()
            if hint_lower in headers_lower:
                prompt_idx = headers_lower.index(hint_lower)
                prompt_col = headers[prompt_idx]

    if prompt_idx == -1:
        prompt_candidates = ['prompt', 'question', 'input', 'text', 'query']
        for cand in prompt_candidates:
            if cand in headers_lower:
                prompt_idx = headers_lower.index(cand)
                prompt_col = headers[prompt_idx]
                break

    # Fallback to the first column if still undetected
    if prompt_idx == -1 and headers:
        prompt_idx = 0
        prompt_col = headers[0]

    # Detect Category column
    category_col = None
    category_idx = -1
    category_candidates = ['category', 'type', 'domain', 'tag']
    for cand in category_candidates:
        if cand in headers_lower:
            category_idx = headers_lower.index(cand)
            category_col = headers[category_idx]
            break

    # Detect Expected Answer column
    answer_col = None
    answer_idx = -1
    answer_candidates = ['expected', 'answer', 'output', 'expected_answer']
    for cand in answer_candidates:
        if cand in headers_lower:
            answer_idx = headers_lower.index(cand)
            answer_col = headers[answer_idx]
            break

    prompts = []
    errors = []

    for row_idx, row in enumerate(reader, start=2):
        if not row:
            continue
        if len(row) <= prompt_idx:
            # Row is too short
            continue

        prompt_val = row[prompt_idx].strip()
        
        category_val = 'custom'
        if category_idx != -1 and len(row) > category_idx:
            category_val = row[category_idx].strip() or 'custom'

        answer_val = None
        if answer_idx != -1 and len(row) > answer_idx:
            answer_val = row[answer_idx].strip() or None

        prompts.append({
            'prompt': prompt_val,
            'category': category_val,
            'expected_answer': answer_val
        })

    return {
        'prompts': prompts,
        'total': len(prompts),
        'detected_columns': {
            'prompt_col': prompt_col,
            'category_col': category_col,
            'answer_col': answer_col
        },
        'errors': errors
    }

def parse_json_dataset(file_content: str, prompt_col_hint: Optional[str] = None) -> dict:
    """
    Parses a JSON formatted dataset. Supports 3 formats:
    Format 1: Array of objects: [{"prompt": "...", "category": "...", "expected": "..."}]
    Format 2: Object with 'prompts' key: {"prompts": [{"prompt": "..."}], "metadata": {}}
    Format 3: Simple string array: ["What is 2+2?", "Explain recursion"]
    """
    try:
        data = json.loads(file_content.strip())
    except Exception as e:
        return {
            'prompts': [],
            'total': 0,
            'detected_columns': {'prompt_col': None, 'category_col': None, 'answer_col': None},
            'errors': [f'Invalid JSON format: {str(e)}']
        }

    raw_list = []
    if isinstance(data, list):
        raw_list = data
    elif isinstance(data, dict):
        if 'prompts' in data and isinstance(data['prompts'], list):
            raw_list = data['prompts']
        else:
            return {
                'prompts': [],
                'total': 0,
                'detected_columns': {'prompt_col': None, 'category_col': None, 'answer_col': None},
                'errors': ["Invalid JSON structure: Expected an array or an object containing a 'prompts' array."]
            }

    if not raw_list:
        return {
            'prompts': [],
            'total': 0,
            'detected_columns': {'prompt_col': None, 'category_col': None, 'answer_col': None},
            'errors': []
        }

    first_item = raw_list[0]
    prompts = []
    errors = []
    detected_columns = {'prompt_col': None, 'category_col': None, 'answer_col': None}

    # Format 3: Simple string array
    if isinstance(first_item, str):
        for item in raw_list:
            prompts.append({
                'prompt': str(item).strip(),
                'category': 'custom',
                'expected_answer': None
            })
        detected_columns = {'prompt_col': 'Element', 'category_col': None, 'answer_col': None}

    # Format 1 or 2 with dictionary objects
    elif isinstance(first_item, dict):
        keys = list(first_item.keys())
        keys_lower = [k.lower() for k in keys]

        # Detect prompt column
        prompt_key = None
        if prompt_col_hint:
            if prompt_col_hint in keys:
                prompt_key = prompt_col_hint
            else:
                hint_lower = prompt_col_hint.lower()
                if hint_lower in keys_lower:
                    prompt_key = keys[keys_lower.index(hint_lower)]

        if not prompt_key:
            prompt_candidates = ['prompt', 'question', 'input', 'text', 'query']
            for cand in prompt_candidates:
                if cand in keys_lower:
                    prompt_key = keys[keys_lower.index(cand)]
                    break
        if not prompt_key and keys:
            prompt_key = keys[0]

        # Detect category column
        category_key = None
        category_candidates = ['category', 'type', 'domain', 'tag']
        for cand in category_candidates:
            if cand in keys_lower:
                category_key = keys[keys_lower.index(cand)]
                break

        # Detect expected answer column
        answer_key = None
        answer_candidates = ['expected', 'answer', 'output', 'expected_answer']
        for cand in answer_candidates:
            if cand in keys_lower:
                answer_key = keys[keys_lower.index(cand)]
                break

        detected_columns = {
            'prompt_col': prompt_key,
            'category_col': category_key,
            'answer_col': answer_key
        }

        for item in raw_list:
            if not isinstance(item, dict):
                continue
            prompt_val = str(item.get(prompt_key, "")).strip() if prompt_key else ""
            category_val = 'custom'
            if category_key:
                category_val = str(item.get(category_key, "custom")).strip() or 'custom'
            
            answer_val = None
            if answer_key:
                val = item.get(answer_key)
                answer_val = str(val).strip() if val is not None else None

            prompts.append({
                'prompt': prompt_val,
                'category': category_val,
                'expected_answer': answer_val
            })
    else:
        return {
            'prompts': [],
            'total': 0,
            'detected_columns': {'prompt_col': None, 'category_col': None, 'answer_col': None},
            'errors': ["Invalid JSON elements: array must contain strings or objects."]
        }

    return {
        'prompts': prompts,
        'total': len(prompts),
        'detected_columns': detected_columns,
        'errors': errors
    }

def validate_dataset(parsed_data: dict) -> dict:
    """
    Validates limits (1-100 prompts), empty strings, and maximum 2000 character length.
    """
    errors = list(parsed_data.get('errors', []))
    warnings = []
    cleaned_prompts = []

    prompts = parsed_data.get('prompts', [])
    if not prompts and not errors:
        errors.append("Dataset contains no prompts.")
        return {
            'valid': False,
            'warnings': warnings,
            'errors': errors,
            'cleaned_prompts': []
        }

    if len(prompts) > 100:
        errors.append(f"Dataset exceeds maximum limit of 100 prompts (found {len(prompts)}).")
        return {
            'valid': False,
            'warnings': warnings,
            'errors': errors,
            'cleaned_prompts': []
        }

    for idx, p in enumerate(prompts, start=1):
        prompt_text = p.get('prompt', '').strip()
        category = p.get('category', 'custom').strip()
        expected = p.get('expected_answer')
        if expected is not None:
            expected = str(expected).strip()

        if not prompt_text:
            warnings.append(f"Row/Item {idx} has an empty prompt and was skipped.")
            continue

        if len(prompt_text) > 2000:
            prompt_text = prompt_text[:2000]
            warnings.append(f"Prompt {idx} exceeded 2000 characters and was truncated.")

        cleaned_prompts.append({
            'prompt': prompt_text,
            'category': category if category else 'custom',
            'expected_answer': expected
        })

    if not cleaned_prompts and not errors:
        errors.append("No valid prompts remaining after validation filter.")

    return {
        'valid': len(errors) == 0,
        'warnings': warnings,
        'errors': errors,
        'cleaned_prompts': cleaned_prompts
    }
