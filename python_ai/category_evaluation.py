"""Offline category/episode metrics. Raw rule points are never probabilities.

Independent labels and frozen acceptance criteria must be supplied separately.
This module cannot approve deployment or claim that fixture metrics are efficacy.
"""
from collections import defaultdict
from datetime import datetime
import math
import random
import statistics

LEVELS = {'LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT'}


def timestamp(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Timestamp must include timezone')
    return result


def metrics(records):
    labelled = [row for row in records if row['label'] is not None]
    available = [row for row in labelled if row['category'] != 'INSUFFICIENT']
    counts = {'tp': 0, 'fp': 0, 'fn': 0, 'tn': 0}
    for row in available:
        predicted = row['category'] == 'HIGH'
        counts['tp' if predicted and row['label'] else 'fp' if predicted else 'fn' if row['label'] else 'tn'] += 1
    def ratio(a, b):
        return a / b if b else None
    return {**counts, 'precision': ratio(counts['tp'], counts['tp'] + counts['fp']),
            'recall': ratio(counts['tp'], counts['tp'] + counts['fn']),
            'false_positive_rate': ratio(counts['fp'], counts['fp'] + counts['tn']),
            'labelled': len(labelled), 'unresolved': len(records) - len(labelled),
            'assessed': len(available), 'coverage': ratio(len(available), len(labelled)),
            'unassessed_positive': sum(row['label'] == 1 and row['category'] == 'INSUFFICIENT' for row in labelled),
            'all_labelled_recall': ratio(counts['tp'], sum(row['label'] == 1 for row in labelled))}


def evaluate_categories(rows, *, bootstrap_samples=1000, seed=0):
    if not rows:
        raise ValueError('Evaluation requires records')
    if not 1 <= bootstrap_samples <= 10000:
        raise ValueError('Bootstrap samples out of bounds')
    episodes = defaultdict(list)
    seen = set()
    for row in rows:
        if row.get('category') not in LEVELS or row.get('baseline_category') not in LEVELS:
            raise ValueError('Unknown category')
        if row.get('label') is not None and (type(row['label']) is not int or row['label'] not in (0, 1)):
            raise ValueError('Labels must be 0, 1 or unresolved null')
        if not row.get('issuer_id') or not row.get('episode_id') or not row.get('scoring_version'):
            raise ValueError('Issuer, episode and scoring version required')
        observed = timestamp(row['observed_at'])
        cutoff = timestamp(row['evidence_cutoff'])
        if cutoff > observed:
            raise ValueError('Future evidence cannot enter a prediction')
        key = (row['issuer_id'], row['episode_id'], observed)
        if key in seen:
            raise ValueError('Duplicate observation')
        seen.add(key)
        episodes[key[:2]].append(row)
    if len({row['scoring_version'] for row in rows}) != 1:
        raise ValueError('Mixed scoring versions require separate evaluations')
    if {row.get('split') for row in rows} != {'holdout'}:
        raise ValueError('Only sealed holdout records may be evaluated together')
    episode_rows = []
    lead_times = []
    for (issuer, episode), group in episodes.items():
        if len({row['label'] for row in group}) != 1 or len({row.get('event_at') for row in group}) != 1:
            raise ValueError('Conflicting episode labels or event dates')
        event = timestamp(group[0]['event_at']) if group[0].get('event_at') else None
        horizon = group[0].get('prediction_horizon_days')
        if type(horizon) is not int or horizon < 1 or horizon > 365 or any(row.get('prediction_horizon_days') != horizon for row in group):
            raise ValueError('One explicit prediction horizon required per episode')
        if group[0]['label'] == 1 and event is None:
            raise ValueError('Positive episode requires event onset')
        eligible = [row for row in group if event is None or 0 <= (event - timestamp(row['observed_at'])).total_seconds() <= horizon * 86400]
        def category(field):
            return 'HIGH' if any(row[field] == 'HIGH' for row in eligible) else 'LOW' if any(row[field] != 'INSUFFICIENT' for row in eligible) else 'INSUFFICIENT'
        episode_rows.append({'issuer_id': issuer, 'episode_id': episode, 'label': group[0]['label'], 'category': category('category'), 'baseline_category': category('baseline_category')})
        high = [timestamp(row['observed_at']) for row in eligible if row['category'] == 'HIGH']
        if group[0]['label'] == 1 and high:
            lead_times.append((event - min(high)).total_seconds() / 86400)
    issuer_groups = defaultdict(list)
    for row in episode_rows:
        issuer_groups[row['issuer_id']].append(row)
    rng = random.Random(seed)
    estimates = defaultdict(list)
    issuer_ids = sorted(issuer_groups)
    for _ in range(bootstrap_samples):
        sample = [row for issuer in rng.choices(issuer_ids, k=len(issuer_ids)) for row in issuer_groups[issuer]]
        result = metrics(sample)
        for field in ['precision', 'recall', 'false_positive_rate', 'coverage']:
            if result[field] is not None:
                estimates[field].append(result[field])
    def interval(values):
        values.sort()
        return [values[max(0, math.floor((len(values)-1)*.025))], values[min(len(values)-1, math.ceil((len(values)-1)*.975))]] if values else None
    observed_only = all(row.get('source_type') == 'observed' and row.get('label_provenance') and row.get('blinded_adjudication') is True for row in rows)
    return {'schema_version': 'scamdunk-category-evaluation/v1', 'release_approval': 'NOT_APPROVED',
            'evidence_class': 'observed_with_label_provenance' if observed_only else 'fixture_or_unverified',
            'scoring_version': rows[0]['scoring_version'], 'observations': metrics(rows),
            'episodes': metrics(episode_rows),
            'baseline_episodes': metrics([{**row, 'category': row['baseline_category']} for row in episode_rows]),
            'clustered_uncertainty': {'unit': 'issuer', 'issuers': len(issuer_ids), 'samples': bootstrap_samples, 'seed': seed, 'intervals_95_percent': {field: interval(values) for field, values in estimates.items()}},
            'lead_time_days': {'detected_positive_episodes': len(lead_times), 'median': statistics.median(lead_times) if lead_times else None},
            'limitations': ['Independent sealed labels, time/issuer split audit and approved acceptance criteria remain required.', 'Intervals can be unstable with small clusters; undefined denominators remain null.', 'No probability calibration is inferred from rule points.']}
