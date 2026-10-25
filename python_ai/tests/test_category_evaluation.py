import pytest
from category_evaluation import evaluate_categories


def row(issuer='a', episode='1', label=1, category='HIGH', observed='2026-09-01T00:00:00Z', **updates):
    return {'issuer_id': issuer, 'episode_id': episode, 'label': label, 'category': category, 'baseline_category': 'HIGH', 'scoring_version': 'candidate-v2', 'observed_at': observed, 'evidence_cutoff': observed, 'event_at': '2026-09-04T00:00:00Z' if label == 1 else None, 'prediction_horizon_days': 7, 'split': 'holdout', 'source_type': 'fixture', **updates}


def test_episode_counts_cluster_uncertainty_and_lead_time():
    report = evaluate_categories([row(), row(observed='2026-09-02T00:00:00Z'), row('b', label=0, category='LOW'), row('c', label=1, category='LOW'), row('d', label=0), row('e', label=None)], bootstrap_samples=100, seed=7)
    assert report['episodes'] == {'tp': 1, 'fp': 1, 'fn': 1, 'tn': 1, 'precision': .5, 'recall': .5, 'false_positive_rate': .5, 'labelled': 4, 'unresolved': 1, 'assessed': 4, 'coverage': 1, 'unassessed_positive': 0, 'all_labelled_recall': .5}
    assert report['lead_time_days'] == {'detected_positive_episodes': 1, 'median': 3}
    assert report['clustered_uncertainty']['issuers'] == 5
    assert report['release_approval'] == 'NOT_APPROVED'
    assert report['evidence_class'] == 'fixture_or_unverified'


def test_insufficient_and_unresolved_are_never_true_negatives():
    report = evaluate_categories([row(category='INSUFFICIENT'), row('b', label=None, category='LOW')], bootstrap_samples=10)
    assert report['episodes']['tn'] == 0
    assert report['episodes']['coverage'] == 0
    assert report['episodes']['unassessed_positive'] == 1
    assert report['episodes']['all_labelled_recall'] == 0
    assert report['episodes']['precision'] is None


@pytest.mark.parametrize('changes', [{'category': 'SAFE'}, {'label': True}, {'evidence_cutoff': '2026-10-01T00:00:00Z'}, {'observed_at': '2026-09-01'}, {'split': 'development'}, {'prediction_horizon_days': 0}, {'event_at': None}])
def test_invalid_evaluation_contract(changes):
    with pytest.raises(ValueError):
        evaluate_categories([row(**changes)], bootstrap_samples=10)


def test_duplicate_and_mixed_versions_are_rejected():
    with pytest.raises(ValueError):
        evaluate_categories([row(), row()], bootstrap_samples=10)
    with pytest.raises(ValueError):
        evaluate_categories([row(), row('b', scoring_version='old')], bootstrap_samples=10)


def test_post_event_and_outside_horizon_alerts_do_not_count_as_early_detection():
    report = evaluate_categories([row(observed='2026-08-01T00:00:00Z'), row(observed='2026-09-05T00:00:00Z')], bootstrap_samples=10)
    assert report['episodes']['tp'] == 0
    assert report['episodes']['coverage'] == 0
    assert report['lead_time_days']['detected_positive_episodes'] == 0
