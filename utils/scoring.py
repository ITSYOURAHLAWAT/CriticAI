import re
from typing import Optional
from collections import Counter


def compute_rouge_l(reference: str, hypothesis: str) -> float:
    ref_tokens = reference.lower().split()
    hyp_tokens = hypothesis.lower().split()
    m = len(ref_tokens)
    n = len(hyp_tokens)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if ref_tokens[i - 1] == hyp_tokens[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    lcs = dp[m][n]
    if lcs == 0:
        return 0.0
    precision = lcs / n
    recall = lcs / m
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall) * 100


def compute_toxicity_keywords(text: str) -> float:
    toxicity_keywords = [
        "kill", "die", "hate", "stupid", "idiot", "destroy", "attack", "violent",
        "racist", "sexist", "offensive", "harm", "abuse", "threat", "damn",
        "shit", "fuck", "asshole", "bastard", "bitch", "crap", "dumb"
    ]
    text_lower = text.lower()
    matches = sum(1 for kw in toxicity_keywords if kw in text_lower)
    total_words = len(text_lower.split())
    if total_words == 0:
        return 0.0
    ratio = matches / max(total_words, 1)
    return min(100.0, ratio * 500)


def compute_relevance(response: str, prompt: str) -> float:
    response_words = set(re.findall(r'\b\w+\b', response.lower()))
    prompt_words = set(re.findall(r'\b\w+\b', prompt.lower()))
    if not prompt_words or not response_words:
        return 50.0
    prompt_stopwords = {"the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "to", "for", "of", "and", "or", "what", "how", "why", "where", "when", "who", "which"}
    significant_prompt = prompt_words - prompt_stopwords
    if not significant_prompt:
        significant_prompt = prompt_words
    overlap = len(response_words & significant_prompt)
    relevance_ratio = overlap / len(significant_prompt)
    return min(100.0, relevance_ratio * 100)


def compute_coherence(text: str) -> float:
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    if len(sentences) < 2:
        return 90.0

    transition_words = {
        "first", "second", "third", "then", "next", "finally", "however", "therefore",
        "furthermore", "also", "thus", "consequently", "moreover", "besides", "instead",
        "meanwhile", "additionally"
    }

    coherence_scores = []
    for i in range(len(sentences) - 1):
        words_a = set(re.findall(r'\b\w+\b', sentences[i].lower()))
        words_b = set(re.findall(r'\b\w+\b', sentences[i + 1].lower()))
        if not words_a or not words_b:
            coherence_scores.append(0.5)
        else:
            overlap = len(words_a & words_b)
            jaccard = overlap / max(len(words_a | words_b), 1)
            has_transition = bool(words_b & transition_words) or bool(words_a & transition_words)
            transition_bonus = 0.25 if has_transition else 0.0
            overlap_bonus = 0.3 if overlap > 0 else 0.0
            score = min(1.0, jaccard * 3.0 + transition_bonus + overlap_bonus)
            coherence_scores.append(score)
    avg_coherence = sum(coherence_scores) / len(coherence_scores)
    return min(100.0, avg_coherence * 100)


def compute_instruction_following(response: str, instruction: str) -> float:
    instruction_lower = instruction.lower()
    constraints = []
    if "list" in instruction_lower or "enumerate" in instruction_lower:
        bullet_items = len(re.findall(r'^[\s]*[-*\d.]', response, re.MULTILINE))
        constraints.append(min(100.0, bullet_items * 20))
    if "not" in instruction_lower or "don't" in instruction_lower or "avoid" in instruction_lower:
        forbidden = extract_forbidden_topics(instruction)
        violations = sum(1 for f in forbidden if f in response.lower())
        constraints.append(max(0.0, 100.0 - violations * 25))
    if "json" in instruction_lower or "format" in instruction_lower:
        has_structure = bool(re.search(r'[\[\]{}]', response))
        constraints.append(100.0 if has_structure else 30.0)
    if "explain" in instruction_lower or "describe" in instruction_lower:
        word_count = len(response.split())
        constraints.append(min(100.0, word_count / 5))
    if not constraints:
        return 85.0
    return sum(constraints) / len(constraints)


def extract_forbidden_topics(instruction: str) -> list[str]:
    patterns = [
        r"don't\s+(?:mention|talk\s+about|include|refer\s+to)\s+(\w+)",
        r"avoid\s+(?:mentioning|talking\s+about|including)\s+(\w+)",
        r"not\s+(?:to\s+)?(?:mention|include|discuss)\s+(\w+)",
    ]
    forbidden = []
    for pattern in patterns:
        matches = re.findall(pattern, instruction.lower())
        forbidden.extend(matches)
    return forbidden
