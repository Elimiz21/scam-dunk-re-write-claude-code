"""
Machine Learning Model Module for Scam Detection System.

This module implements:
- Synthetic training data generation
- RandomForestClassifier training and evaluation
- Model persistence (save/load)
- Scam probability prediction

The model is trained on synthetic examples that mimic known
pump-and-dump patterns for scams and normal market behavior.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Union
import joblib
import os
from datetime import datetime

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix
)
from sklearn.preprocessing import StandardScaler

from config import RF_MODEL_CONFIG, MODEL_PATHS


class ScamDetectorRF:
    """Random Forest-based scam detection model."""

    def __init__(self, model_config: Dict = None):
        """
        Initialize the scam detector.

        Args:
            model_config: Configuration for Random Forest (optional)
        """
        self.config = model_config or RF_MODEL_CONFIG
        self.model = None
        self.scaler = StandardScaler()
        self.feature_names = None
        self.is_trained = False
        self.training_metrics = {}

    def _create_model(self) -> RandomForestClassifier:
        """Create a new Random Forest model with configured parameters."""
        return RandomForestClassifier(
            n_estimators=self.config.get('n_estimators', 100),
            max_depth=self.config.get('max_depth', 10),
            min_samples_split=self.config.get('min_samples_split', 5),
            min_samples_leaf=self.config.get('min_samples_leaf', 2),
            random_state=self.config.get('random_state', 42),
            n_jobs=-1,  # Use all available cores
            class_weight='balanced'  # Handle imbalanced classes
        )

    def generate_synthetic_training_data(
        self,
        n_scam_samples: int = 500,
        n_normal_samples: int = 500
    ) -> Tuple[np.ndarray, np.ndarray, List[str]]:
        """
        Generate synthetic training data for scam detection.

        Creates feature vectors that mimic:
        - Scam scenarios: pump-and-dump patterns, OTC stocks, SEC flagged
        - Normal scenarios: typical market behavior, major exchanges

        Args:
            n_scam_samples: Number of scam examples to generate
            n_normal_samples: Number of normal examples to generate

        Returns:
            Tuple of (features, labels, feature_names)
        """
        np.random.seed(42)

        feature_names = [
            'return_zscore_short', 'return_zscore_long', 'price_zscore_long',
            'volume_zscore_short', 'volume_zscore_long', 'volume_surge_factor',
            'atr_percent', 'keltner_position', 'keltner_breakout_upper', 'keltner_breakout_lower',
            'price_change_1d', 'price_change_7d', 'price_change_30d',
            'is_pumping_7d', 'is_dumping_7d', 'volume_explosion_moderate', 'volume_explosion_extreme',
            'pump_pattern', 'roc_7', 'roc_14', 'rsi_14',
            'log_market_cap', 'is_micro_cap', 'is_small_cap',
            'is_micro_liquidity', 'is_low_liquidity', 'is_otc', 'float_turnover',
            'sec_flagged', 'has_news', 'sentiment_score'
        ]

        all_features = []
        all_labels = []

        # Generate SCAM samples
        for _ in range(n_scam_samples):
            # Scam characteristics: high z-scores, volume surges, OTC, micro cap
            features = {
                'return_zscore_short': np.random.uniform(1.5, 4.0),
                'return_zscore_long': np.random.uniform(1.0, 3.5),
                'price_zscore_long': np.random.uniform(1.5, 4.0),
                'volume_zscore_short': np.random.uniform(2.0, 5.0),
                'volume_zscore_long': np.random.uniform(1.5, 4.0),
                'volume_surge_factor': np.random.uniform(5, 20),
                'atr_percent': np.random.uniform(8, 25),
                'keltner_position': np.random.uniform(0.8, 1.5),
                'keltner_breakout_upper': np.random.choice([0, 1], p=[0.3, 0.7]),
                'keltner_breakout_lower': np.random.choice([0, 1], p=[0.9, 0.1]),
                'price_change_1d': np.random.uniform(0.1, 0.5),
                'price_change_7d': np.random.uniform(0.5, 2.5),  # 50-250% weekly gain
                'price_change_30d': np.random.uniform(0.8, 5.0),
                'is_pumping_7d': np.random.choice([0, 1], p=[0.2, 0.8]),
                'is_dumping_7d': np.random.choice([0, 1], p=[0.7, 0.3]),
                'volume_explosion_moderate': np.random.choice([0, 1], p=[0.2, 0.8]),
                'volume_explosion_extreme': np.random.choice([0, 1], p=[0.4, 0.6]),
                'pump_pattern': np.random.choice([0, 1], p=[0.3, 0.7]),
                'roc_7': np.random.uniform(30, 150),
                'roc_14': np.random.uniform(40, 200),
                'rsi_14': np.random.uniform(70, 95),  # Overbought
                'log_market_cap': np.log1p(np.random.uniform(1e6, 5e7)),  # Low market cap
                'is_micro_cap': np.random.choice([0, 1], p=[0.1, 0.9]),
                'is_small_cap': np.random.choice([0, 1], p=[0.1, 0.9]),
                'is_micro_liquidity': np.random.choice([0, 1], p=[0.2, 0.8]),
                'is_low_liquidity': np.random.choice([0, 1], p=[0.1, 0.9]),
                'is_otc': np.random.choice([0, 1], p=[0.2, 0.8]),
                'float_turnover': np.random.uniform(0.1, 0.8),  # High turnover
                'sec_flagged': np.random.choice([0, 1], p=[0.6, 0.4]),  # Sometimes flagged
                'has_news': np.random.choice([0, 1], p=[0.8, 0.2]),  # Usually no news
                'sentiment_score': np.random.uniform(-0.2, 0.3),  # Mixed/hyped sentiment
            }

            all_features.append([features[name] for name in feature_names])
            all_labels.append(1)  # Scam label

        # Generate NORMAL samples
        for _ in range(n_normal_samples):
            # Normal characteristics: moderate z-scores, stable volume, major exchanges
            features = {
                'return_zscore_short': np.random.uniform(-1.5, 1.5),
                'return_zscore_long': np.random.uniform(-1.0, 1.0),
                'price_zscore_long': np.random.uniform(-1.5, 1.5),
                'volume_zscore_short': np.random.uniform(-1.0, 1.5),
                'volume_zscore_long': np.random.uniform(-0.5, 1.0),
                'volume_surge_factor': np.random.uniform(0.5, 3.0),
                'atr_percent': np.random.uniform(1, 5),
                'keltner_position': np.random.uniform(0.3, 0.7),
                'keltner_breakout_upper': np.random.choice([0, 1], p=[0.9, 0.1]),
                'keltner_breakout_lower': np.random.choice([0, 1], p=[0.9, 0.1]),
                'price_change_1d': np.random.uniform(-0.05, 0.05),
                'price_change_7d': np.random.uniform(-0.15, 0.20),  # Normal weekly range
                'price_change_30d': np.random.uniform(-0.20, 0.30),
                'is_pumping_7d': np.random.choice([0, 1], p=[0.9, 0.1]),
                'is_dumping_7d': np.random.choice([0, 1], p=[0.9, 0.1]),
                'volume_explosion_moderate': np.random.choice([0, 1], p=[0.9, 0.1]),
                'volume_explosion_extreme': np.random.choice([0, 1], p=[0.98, 0.02]),
                'pump_pattern': np.random.choice([0, 1], p=[0.95, 0.05]),
                'roc_7': np.random.uniform(-10, 15),
                'roc_14': np.random.uniform(-15, 20),
                'rsi_14': np.random.uniform(30, 70),  # Normal range
                'log_market_cap': np.log1p(np.random.uniform(5e8, 5e11)),  # Higher market cap
                'is_micro_cap': np.random.choice([0, 1], p=[0.95, 0.05]),
                'is_small_cap': np.random.choice([0, 1], p=[0.7, 0.3]),
                'is_micro_liquidity': np.random.choice([0, 1], p=[0.95, 0.05]),
                'is_low_liquidity': np.random.choice([0, 1], p=[0.85, 0.15]),
                'is_otc': np.random.choice([0, 1], p=[0.95, 0.05]),
                'float_turnover': np.random.uniform(0.001, 0.05),  # Low turnover
                'sec_flagged': 0,  # Never flagged
                'has_news': np.random.choice([0, 1], p=[0.4, 0.6]),  # Often has news
                'sentiment_score': np.random.uniform(-0.3, 0.5),  # Normal sentiment range
            }

            all_features.append([features[name] for name in feature_names])
            all_labels.append(0)  # Normal label

        # Add some edge cases: legitimate stocks with high volatility (e.g., earnings)
        for _ in range(n_normal_samples // 5):
            features = {
                'return_zscore_short': np.random.uniform(1.5, 3.0),  # High but with news
                'return_zscore_long': np.random.uniform(0.5, 1.5),
                'price_zscore_long': np.random.uniform(1.0, 2.5),
                'volume_zscore_short': np.random.uniform(2.0, 4.0),
                'volume_zscore_long': np.random.uniform(1.0, 2.5),
                'volume_surge_factor': np.random.uniform(3, 8),
                'atr_percent': np.random.uniform(4, 10),
                'keltner_position': np.random.uniform(0.7, 1.1),
                'keltner_breakout_upper': np.random.choice([0, 1], p=[0.5, 0.5]),
                'keltner_breakout_lower': 0,
                'price_change_1d': np.random.uniform(0.1, 0.25),
                'price_change_7d': np.random.uniform(0.15, 0.40),  # Jump but explained
                'price_change_30d': np.random.uniform(0.10, 0.50),
                'is_pumping_7d': np.random.choice([0, 1], p=[0.3, 0.7]),
                'is_dumping_7d': 0,
                'volume_explosion_moderate': np.random.choice([0, 1], p=[0.3, 0.7]),
                'volume_explosion_extreme': np.random.choice([0, 1], p=[0.7, 0.3]),
                'pump_pattern': np.random.choice([0, 1], p=[0.6, 0.4]),
                'roc_7': np.random.uniform(10, 35),
                'roc_14': np.random.uniform(15, 45),
                'rsi_14': np.random.uniform(60, 80),
                'log_market_cap': np.log1p(np.random.uniform(1e9, 5e11)),  # Large cap
                'is_micro_cap': 0,
                'is_small_cap': np.random.choice([0, 1], p=[0.7, 0.3]),
                'is_micro_liquidity': 0,
                'is_low_liquidity': 0,
                'is_otc': 0,
                'float_turnover': np.random.uniform(0.02, 0.1),
                'sec_flagged': 0,
                'has_news': 1,  # KEY: Has news explaining the move
                'sentiment_score': np.random.uniform(0.3, 0.8),  # Positive sentiment
            }

            all_features.append([features[name] for name in feature_names])
            all_labels.append(0)  # Normal - explained by news

        return np.array(all_features), np.array(all_labels), feature_names

    def train(
        self,
        X: np.ndarray = None,
        y: np.ndarray = None,
        feature_names: List[str] = None,
        test_size: float = 0.2
    ) -> Dict[str, float]:
        """
        Train the Random Forest model.

        Args:
            X: Feature matrix (if None, generates synthetic data)
            y: Labels (if None, generates synthetic data)
            feature_names: Names of features
            test_size: Fraction of data for testing

        Returns:
            Dictionary of training metrics
        """
        # Generate synthetic data if not provided
        if X is None or y is None:
            print("Generating synthetic training data...")
            X, y, feature_names = self.generate_synthetic_training_data()

        self.feature_names = feature_names

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)

        # Create and train model
        print("Training Random Forest model...")
        self.model = self._create_model()
        self.model.fit(X_train_scaled, y_train)

        # Evaluate
        y_pred = self.model.predict(X_test_scaled)
        y_proba = self.model.predict_proba(X_test_scaled)[:, 1]

        # Calculate metrics
        self.training_metrics = {
            'accuracy': accuracy_score(y_test, y_pred),
            'precision': precision_score(y_test, y_pred, zero_division=0),
            'recall': recall_score(y_test, y_pred, zero_division=0),
            'f1_score': f1_score(y_test, y_pred, zero_division=0),
            'train_samples': len(X_train),
            'test_samples': len(X_test),
            'trained_at': datetime.now().isoformat()
        }

        self.is_trained = True

        print("\nTraining Results:")
        print(f"  Accuracy:  {self.training_metrics['accuracy']:.4f}")
        print(f"  Precision: {self.training_metrics['precision']:.4f}")
        print(f"  Recall:    {self.training_metrics['recall']:.4f}")
        print(f"  F1 Score:  {self.training_metrics['f1_score']:.4f}")

        # Confusion matrix
        cm = confusion_matrix(y_test, y_pred)
        print(f"\nConfusion Matrix:")
        print(f"  True Negatives:  {cm[0, 0]}")
        print(f"  False Positives: {cm[0, 1]}")
        print(f"  False Negatives: {cm[1, 0]}")
        print(f"  True Positives:  {cm[1, 1]}")

        return self.training_metrics

    def predict_scam_probability(
        self,
        features: np.ndarray
    ) -> Tuple[float, int]:
        """
        Predict scam probability for given features.

        Args:
            features: Feature vector (1D or 2D array)

        Returns:
            Tuple of (probability, prediction)
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call train() first.")

        # Ensure 2D array
        if features.ndim == 1:
            features = features.reshape(1, -1)

        # Scale features
        features_scaled = self.scaler.transform(features)

        # Predict
        probability = self.model.predict_proba(features_scaled)[0, 1]
        prediction = int(probability >= 0.5)

        return probability, prediction

    def get_feature_importance(self, top_n: int = 10) -> Dict[str, float]:
        """
        Get feature importances from the trained model.

        Args:
            top_n: Number of top features to return

        Returns:
            Dictionary of feature names to importance scores
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call train() first.")

        importances = self.model.feature_importances_
        indices = np.argsort(importances)[::-1][:top_n]

        return {
            self.feature_names[i]: float(importances[i])
            for i in indices
        }

    def save(self, model_path: str = None, scaler_path: str = None):
        """
        Save trained model and scaler to disk.

        Args:
            model_path: Path for model file
            scaler_path: Path for scaler file
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call train() first.")

        model_path = model_path or MODEL_PATHS['rf_model']
        scaler_path = scaler_path or MODEL_PATHS['scaler']

        # Ensure directories exist
        os.makedirs(os.path.dirname(model_path) if os.path.dirname(model_path) else '.', exist_ok=True)
        os.makedirs(os.path.dirname(scaler_path) if os.path.dirname(scaler_path) else '.', exist_ok=True)

        # Save model and metadata
        model_data = {
            'model': self.model,
            'feature_names': self.feature_names,
            'training_metrics': self.training_metrics,
            'config': self.config
        }
        joblib.dump(model_data, model_path)
        joblib.dump(self.scaler, scaler_path)

        print(f"Model saved to {model_path}")
        print(f"Scaler saved to {scaler_path}")

    def load(self, model_path: str = None, scaler_path: str = None) -> bool:
        """
        Load trained model and scaler from disk.

        Args:
            model_path: Path to model file
            scaler_path: Path to scaler file

        Returns:
            True if loaded successfully, False otherwise
        """
        model_path = model_path or MODEL_PATHS['rf_model']
        scaler_path = scaler_path or MODEL_PATHS['scaler']

        try:
            model_data = joblib.load(model_path)
            self.model = model_data['model']
            self.feature_names = model_data['feature_names']
            self.training_metrics = model_data['training_metrics']
            self.config = model_data.get('config', self.config)

            self.scaler = joblib.load(scaler_path)
            self.is_trained = True

            print(f"Model loaded from {model_path}")
            return True

        except FileNotFoundError:
            print(f"Model files not found. Train the model first.")
            return False


def train_random_forest_model(save_model: bool = True) -> ScamDetectorRF:
    """
    Convenience function to train and optionally save the RF model.

    Args:
        save_model: Whether to save the trained model

    Returns:
        Trained ScamDetectorRF instance
    """
    detector = ScamDetectorRF()
    detector.train()

    if save_model:
        detector.save()

    return detector


if __name__ == '__main__':
    print("=" * 60)
    print("Testing Machine Learning Model Module")
    print("=" * 60)

    # Test 1: Initialize and train model
    print("\n1. Training Random Forest Model...")
    detector = ScamDetectorRF()
    metrics = detector.train()

    # Test 2: Feature importance
    print("\n2. Top Feature Importances:")
    importances = detector.get_feature_importance(top_n=10)
    for feature, importance in importances.items():
        print(f"   {feature}: {importance:.4f}")

    # Test 3: Test predictions on synthetic examples
    print("\n3. Testing predictions on synthetic examples:")

    # Create a scam-like feature vector
    scam_features = np.array([
        3.0,   # return_zscore_short (high)
        2.5,   # return_zscore_long (high)
        3.0,   # price_zscore_long (high)
        4.0,   # volume_zscore_short (very high)
        3.0,   # volume_zscore_long (high)
        12.0,  # volume_surge_factor (12x)
        15.0,  # atr_percent (high volatility)
        1.2,   # keltner_position (above upper band)
        1,     # keltner_breakout_upper
        0,     # keltner_breakout_lower
        0.25,  # price_change_1d (25%)
        1.5,   # price_change_7d (150%)
        2.0,   # price_change_30d (200%)
        1,     # is_pumping_7d
        0,     # is_dumping_7d
        1,     # volume_explosion_moderate
        1,     # volume_explosion_extreme
        1,     # pump_pattern
        80,    # roc_7
        120,   # roc_14
        85,    # rsi_14 (overbought)
        np.log1p(10_000_000),  # log_market_cap (small)
        1,     # is_micro_cap
        1,     # is_small_cap
        1,     # is_micro_liquidity
        1,     # is_low_liquidity
        1,     # is_otc
        0.5,   # float_turnover (high)
        1,     # sec_flagged (YES!)
        0,     # has_news (no news)
        0.1,   # sentiment_score
    ])

    scam_prob, scam_pred = detector.predict_scam_probability(scam_features)
    print(f"   Scam-like example: Probability={scam_prob:.3f}, Prediction={'SCAM' if scam_pred else 'NORMAL'}")

    # Create a normal feature vector
    normal_features = np.array([
        0.5,   # return_zscore_short
        0.3,   # return_zscore_long
        0.2,   # price_zscore_long
        0.5,   # volume_zscore_short
        0.3,   # volume_zscore_long
        1.2,   # volume_surge_factor
        2.5,   # atr_percent
        0.5,   # keltner_position
        0,     # keltner_breakout_upper
        0,     # keltner_breakout_lower
        0.02,  # price_change_1d (2%)
        0.08,  # price_change_7d (8%)
        0.15,  # price_change_30d (15%)
        0,     # is_pumping_7d
        0,     # is_dumping_7d
        0,     # volume_explosion_moderate
        0,     # volume_explosion_extreme
        0,     # pump_pattern
        5,     # roc_7
        10,    # roc_14
        50,    # rsi_14 (normal)
        np.log1p(50_000_000_000),  # log_market_cap (large)
        0,     # is_micro_cap
        0,     # is_small_cap
        0,     # is_micro_liquidity
        0,     # is_low_liquidity
        0,     # is_otc
        0.01,  # float_turnover (low)
        0,     # sec_flagged (no)
        1,     # has_news (yes)
        0.3,   # sentiment_score
    ])

    normal_prob, normal_pred = detector.predict_scam_probability(normal_features)
    print(f"   Normal example: Probability={normal_prob:.3f}, Prediction={'SCAM' if normal_pred else 'NORMAL'}")

    # Test 4: Save model
    print("\n4. Saving model...")
    detector.save()

    # Test 5: Load model
    print("\n5. Loading model...")
    detector2 = ScamDetectorRF()
    loaded = detector2.load()
    if loaded:
        prob2, pred2 = detector2.predict_scam_probability(scam_features)
        print(f"   Loaded model prediction: Probability={prob2:.3f}")
        print(f"   Predictions match: {abs(scam_prob - prob2) < 0.001}")

    print("\n" + "=" * 60)
    print("Machine Learning Model Module Tests Complete!")
    print("=" * 60)
