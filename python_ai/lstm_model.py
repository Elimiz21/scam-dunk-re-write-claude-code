"""
LSTM Deep Learning Model Module for Scam Detection System.

This module implements:
- Sequence data preparation for time-series analysis
- LSTM neural network for detecting temporal patterns
- Training workflow with synthetic sequence data
- Model persistence (save/load)
- Sequence-based scam probability prediction

The LSTM model is designed to capture temporal patterns in price/volume
data that may indicate pump-and-dump schemes.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Union
import os
import warnings
from datetime import datetime

# Suppress TensorFlow warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
warnings.filterwarnings('ignore')

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization, Input
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.optimizers import Adam
from sklearn.preprocessing import MinMaxScaler

from config import LSTM_MODEL_CONFIG, MODEL_PATHS


class ScamDetectorLSTM:
    """LSTM-based scam detection model for time-series analysis."""

    def __init__(self, config: Dict = None):
        """
        Initialize the LSTM scam detector.

        Args:
            config: Configuration for LSTM model (optional)
        """
        self.config = config or LSTM_MODEL_CONFIG
        self.model = None
        self.scaler = MinMaxScaler()
        self.is_trained = False
        self.training_history = None
        self.feature_columns = [
            'Close', 'Volume', 'Return', 'Volume_Surge_Factor',
            'Price_ZScore_Long', 'Volume_ZScore_Long'
        ]

    def _build_model(self, input_shape: Tuple[int, int]) -> Sequential:
        """
        Build the LSTM neural network architecture.

        Args:
            input_shape: Shape of input sequences (timesteps, features)

        Returns:
            Compiled Keras Sequential model
        """
        model = Sequential([
            Input(shape=input_shape),

            # First LSTM layer
            LSTM(
                units=self.config.get('lstm_units_1', 64),
                return_sequences=True,
                kernel_regularizer=tf.keras.regularizers.l2(0.01)
            ),
            BatchNormalization(),
            Dropout(self.config.get('dropout_rate', 0.2)),

            # Second LSTM layer
            LSTM(
                units=self.config.get('lstm_units_2', 32),
                return_sequences=False,
                kernel_regularizer=tf.keras.regularizers.l2(0.01)
            ),
            BatchNormalization(),
            Dropout(self.config.get('dropout_rate', 0.2)),

            # Dense layers
            Dense(
                units=self.config.get('dense_units', 16),
                activation='relu',
                kernel_regularizer=tf.keras.regularizers.l2(0.01)
            ),
            Dropout(self.config.get('dropout_rate', 0.2)),

            # Output layer (binary classification)
            Dense(1, activation='sigmoid')
        ])

        model.compile(
            optimizer=Adam(learning_rate=0.001),
            loss='binary_crossentropy',
            metrics=['accuracy', tf.keras.metrics.AUC(name='auc')]
        )

        return model

    def generate_synthetic_sequence_data(
        self,
        n_scam_sequences: int = 200,
        n_normal_sequences: int = 200,
        sequence_length: int = None
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generate synthetic sequence data for training.

        Creates time-series sequences that mimic:
        - Scam: pump-and-dump patterns (rapid rise + crash)
        - Normal: typical market fluctuations

        Args:
            n_scam_sequences: Number of scam sequences to generate
            n_normal_sequences: Number of normal sequences to generate
            sequence_length: Length of each sequence

        Returns:
            Tuple of (sequences, labels)
        """
        sequence_length = sequence_length or self.config.get('sequence_length', 30)
        n_features = len(self.feature_columns)

        np.random.seed(42)

        all_sequences = []
        all_labels = []

        # Generate SCAM sequences (pump-and-dump pattern)
        for i in range(n_scam_sequences):
            sequence = np.zeros((sequence_length, n_features))

            # Start with base values
            base_price = np.random.uniform(1, 10)
            base_volume = np.random.uniform(10000, 100000)

            # Phase 1: Gradual accumulation (first third)
            accum_end = sequence_length // 3
            for t in range(accum_end):
                price_mult = 1 + np.random.uniform(0, 0.02) * t / accum_end
                sequence[t, 0] = base_price * price_mult  # Close
                sequence[t, 1] = base_volume * np.random.uniform(1, 2)  # Volume
                sequence[t, 2] = np.random.uniform(-0.02, 0.03)  # Return
                sequence[t, 3] = np.random.uniform(1, 2)  # Volume_Surge_Factor
                sequence[t, 4] = np.random.uniform(-1, 1)  # Price_ZScore_Long
                sequence[t, 5] = np.random.uniform(0, 1)  # Volume_ZScore_Long

            # Phase 2: Pump phase (middle third - rapid price increase)
            pump_start = accum_end
            pump_end = 2 * sequence_length // 3
            pump_price = sequence[accum_end - 1, 0]

            for t in range(pump_start, pump_end):
                progress = (t - pump_start) / (pump_end - pump_start)
                # Exponential price increase
                price_mult = 1 + progress * np.random.uniform(0.5, 2.0)
                sequence[t, 0] = pump_price * price_mult  # Close
                sequence[t, 1] = base_volume * np.random.uniform(5, 15)  # Volume spike
                sequence[t, 2] = np.random.uniform(0.05, 0.20)  # High returns
                sequence[t, 3] = np.random.uniform(5, 15)  # High volume surge
                sequence[t, 4] = np.random.uniform(2, 5)  # High price z-score
                sequence[t, 5] = np.random.uniform(2, 5)  # High volume z-score

            # Phase 3: Dump phase (final third - crash)
            dump_start = pump_end
            peak_price = sequence[pump_end - 1, 0]

            for t in range(dump_start, sequence_length):
                progress = (t - dump_start) / (sequence_length - dump_start)
                # Sharp price decline
                price_mult = 1 - progress * np.random.uniform(0.5, 0.8)
                sequence[t, 0] = peak_price * max(price_mult, 0.2)  # Close
                sequence[t, 1] = base_volume * np.random.uniform(3, 10)  # Still high volume
                sequence[t, 2] = np.random.uniform(-0.20, -0.05)  # Negative returns
                sequence[t, 3] = np.random.uniform(3, 10)  # Volume still elevated
                sequence[t, 4] = np.random.uniform(-2, 1)  # Price z-score varies
                sequence[t, 5] = np.random.uniform(1, 4)  # Volume z-score

            all_sequences.append(sequence)
            all_labels.append(1)  # Scam label

        # Generate NORMAL sequences
        for i in range(n_normal_sequences):
            sequence = np.zeros((sequence_length, n_features))

            base_price = np.random.uniform(10, 200)
            base_volume = np.random.uniform(100000, 1000000)

            # Random walk with slight drift
            current_price = base_price

            for t in range(sequence_length):
                # Normal price movement (small random changes)
                price_change = np.random.normal(0.001, 0.02)
                current_price = current_price * (1 + price_change)

                sequence[t, 0] = current_price  # Close
                sequence[t, 1] = base_volume * np.random.uniform(0.7, 1.5)  # Volume
                sequence[t, 2] = price_change  # Return
                sequence[t, 3] = np.random.uniform(0.8, 1.5)  # Normal volume surge
                sequence[t, 4] = np.random.uniform(-1.5, 1.5)  # Price_ZScore_Long
                sequence[t, 5] = np.random.uniform(-1, 1)  # Volume_ZScore_Long

            all_sequences.append(sequence)
            all_labels.append(0)  # Normal label

        # Add legitimate high-volatility sequences (e.g., earnings reactions)
        for i in range(n_normal_sequences // 4):
            sequence = np.zeros((sequence_length, n_features))

            base_price = np.random.uniform(50, 300)
            base_volume = np.random.uniform(500000, 5000000)
            current_price = base_price

            # Event happens in middle of sequence
            event_day = sequence_length // 2

            for t in range(sequence_length):
                if t < event_day:
                    # Normal before event
                    price_change = np.random.normal(0.001, 0.01)
                    vol_mult = np.random.uniform(0.8, 1.2)
                elif t == event_day:
                    # Big jump on event day (positive earnings)
                    price_change = np.random.uniform(0.1, 0.25)
                    vol_mult = np.random.uniform(3, 8)
                else:
                    # Normal after event (at new level)
                    price_change = np.random.normal(0.002, 0.015)
                    vol_mult = np.random.uniform(1.0, 2.0)

                current_price = current_price * (1 + price_change)
                sequence[t, 0] = current_price
                sequence[t, 1] = base_volume * vol_mult
                sequence[t, 2] = price_change
                sequence[t, 3] = vol_mult
                sequence[t, 4] = price_change * 20 if t == event_day else np.random.uniform(-1, 1)
                sequence[t, 5] = (vol_mult - 1) * 2 if vol_mult > 1.5 else np.random.uniform(-0.5, 0.5)

            all_sequences.append(sequence)
            all_labels.append(0)  # Normal - legitimate event

        return np.array(all_sequences), np.array(all_labels)

    def prepare_sequence_from_df(
        self,
        df: pd.DataFrame,
        sequence_length: int = None
    ) -> np.ndarray:
        """
        Prepare sequence data from a DataFrame with engineered features.

        Args:
            df: DataFrame with price data and features
            sequence_length: Length of sequence to extract

        Returns:
            Numpy array of shape (1, sequence_length, n_features)
        """
        sequence_length = sequence_length or self.config.get('sequence_length', 30)

        # Map available columns to required features
        feature_mapping = {
            'Close': 'Close',
            'Volume': 'Volume',
            'Return': 'Return',
            'Volume_Surge_Factor': 'Volume_Surge_Factor',
            'Price_ZScore_Long': 'Price_ZScore_Long',
            'Volume_ZScore_Long': 'Volume_ZScore_Long'
        }

        # Extract available features
        available_features = []
        for target_col, source_col in feature_mapping.items():
            if source_col in df.columns:
                available_features.append(source_col)
            else:
                # Create placeholder with zeros
                df[source_col] = 0
                available_features.append(source_col)

        # Get last N rows
        if len(df) < sequence_length:
            # Pad with first row values if needed
            padding_needed = sequence_length - len(df)
            pad_df = pd.concat([df.iloc[[0]] * padding_needed, df])
            sequence = pad_df[available_features].tail(sequence_length).values
        else:
            sequence = df[available_features].tail(sequence_length).values

        return sequence.reshape(1, sequence_length, len(available_features))

    def train(
        self,
        X: np.ndarray = None,
        y: np.ndarray = None,
        validation_split: float = None,
        epochs: int = None,
        batch_size: int = None,
        verbose: int = 1
    ) -> Dict[str, float]:
        """
        Train the LSTM model.

        Args:
            X: Sequence data (if None, generates synthetic)
            y: Labels (if None, generates synthetic)
            validation_split: Fraction of data for validation
            epochs: Number of training epochs
            batch_size: Training batch size
            verbose: Verbosity level

        Returns:
            Dictionary of training metrics
        """
        # Generate synthetic data if not provided
        if X is None or y is None:
            print("Generating synthetic sequence data...")
            X, y = self.generate_synthetic_sequence_data()

        validation_split = validation_split or self.config.get('validation_split', 0.2)
        epochs = epochs or self.config.get('epochs', 50)
        batch_size = batch_size or self.config.get('batch_size', 32)

        # Normalize sequences
        n_samples, n_timesteps, n_features = X.shape
        X_reshaped = X.reshape(-1, n_features)
        X_scaled = self.scaler.fit_transform(X_reshaped)
        X_scaled = X_scaled.reshape(n_samples, n_timesteps, n_features)

        # Shuffle data
        indices = np.random.permutation(len(X_scaled))
        X_scaled = X_scaled[indices]
        y = y[indices]

        # Build model
        print("Building LSTM model...")
        input_shape = (n_timesteps, n_features)
        self.model = self._build_model(input_shape)

        if verbose:
            self.model.summary()

        # Callbacks
        callbacks = [
            EarlyStopping(
                monitor='val_loss',
                patience=10,
                restore_best_weights=True,
                verbose=1
            ),
            ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=5,
                min_lr=0.0001,
                verbose=1
            )
        ]

        # Train
        print("\nTraining LSTM model...")
        history = self.model.fit(
            X_scaled, y,
            validation_split=validation_split,
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks,
            verbose=verbose
        )

        self.training_history = history.history
        self.is_trained = True

        # Calculate final metrics
        val_indices = int(len(X_scaled) * (1 - validation_split))
        X_val = X_scaled[val_indices:]
        y_val = y[val_indices:]

        predictions = (self.model.predict(X_val, verbose=0) > 0.5).astype(int)
        accuracy = np.mean(predictions.flatten() == y_val)

        metrics = {
            'final_loss': float(history.history['loss'][-1]),
            'final_val_loss': float(history.history['val_loss'][-1]),
            'final_accuracy': float(history.history['accuracy'][-1]),
            'final_val_accuracy': float(history.history['val_accuracy'][-1]),
            'final_auc': float(history.history.get('auc', [0])[-1]),
            'test_accuracy': float(accuracy),
            'epochs_trained': len(history.history['loss']),
            'trained_at': datetime.now().isoformat()
        }

        print("\nTraining Results:")
        print(f"  Final Loss: {metrics['final_loss']:.4f}")
        print(f"  Final Val Loss: {metrics['final_val_loss']:.4f}")
        print(f"  Final Accuracy: {metrics['final_accuracy']:.4f}")
        print(f"  Final Val Accuracy: {metrics['final_val_accuracy']:.4f}")
        print(f"  Epochs Trained: {metrics['epochs_trained']}")

        return metrics

    def predict_lstm_probability(
        self,
        sequence_data: np.ndarray
    ) -> Tuple[float, int]:
        """
        Predict scam probability for a sequence.

        Args:
            sequence_data: Sequence array (timesteps, features) or (1, timesteps, features)

        Returns:
            Tuple of (probability, prediction)
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call train() first.")

        # Ensure correct shape
        if sequence_data.ndim == 2:
            sequence_data = sequence_data.reshape(1, *sequence_data.shape)

        # Scale
        n_samples, n_timesteps, n_features = sequence_data.shape
        seq_reshaped = sequence_data.reshape(-1, n_features)
        seq_scaled = self.scaler.transform(seq_reshaped)
        seq_scaled = seq_scaled.reshape(n_samples, n_timesteps, n_features)

        # Predict
        probability = float(self.model.predict(seq_scaled, verbose=0)[0, 0])
        prediction = int(probability >= 0.5)

        return probability, prediction

    def save(self, model_path: str = None):
        """
        Save the trained LSTM model.

        Args:
            model_path: Path to save model
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call train() first.")

        model_path = model_path or MODEL_PATHS['lstm_model']

        # Ensure directory exists
        os.makedirs(os.path.dirname(model_path) if os.path.dirname(model_path) else '.', exist_ok=True)

        # Save model
        self.model.save(model_path)

        # Save scaler separately
        scaler_path = model_path.replace('.keras', '_scaler.npy').replace('.h5', '_scaler.npy')
        np.save(scaler_path, {
            'scale_': self.scaler.scale_,
            'min_': self.scaler.min_,
            'data_min_': self.scaler.data_min_,
            'data_max_': self.scaler.data_max_,
            'data_range_': self.scaler.data_range_,
            'feature_columns': self.feature_columns
        })

        print(f"LSTM model saved to {model_path}")

    def load(self, model_path: str = None) -> bool:
        """
        Load a trained LSTM model.

        Args:
            model_path: Path to model file

        Returns:
            True if loaded successfully
        """
        model_path = model_path or MODEL_PATHS['lstm_model']

        try:
            self.model = load_model(model_path)

            # Load scaler
            scaler_path = model_path.replace('.keras', '_scaler.npy').replace('.h5', '_scaler.npy')
            scaler_data = np.load(scaler_path, allow_pickle=True).item()

            self.scaler = MinMaxScaler()
            self.scaler.scale_ = scaler_data['scale_']
            self.scaler.min_ = scaler_data['min_']
            self.scaler.data_min_ = scaler_data['data_min_']
            self.scaler.data_max_ = scaler_data['data_max_']
            self.scaler.data_range_ = scaler_data['data_range_']
            self.feature_columns = scaler_data.get('feature_columns', self.feature_columns)

            self.is_trained = True
            print(f"LSTM model loaded from {model_path}")
            return True

        except (FileNotFoundError, OSError) as e:
            print(f"Could not load model: {e}")
            return False


def train_lstm_model(
    save_model: bool = True,
    epochs: int = None,
    verbose: int = 1
) -> ScamDetectorLSTM:
    """
    Convenience function to train and optionally save the LSTM model.

    Args:
        save_model: Whether to save the trained model
        epochs: Number of training epochs
        verbose: Verbosity level

    Returns:
        Trained ScamDetectorLSTM instance
    """
    detector = ScamDetectorLSTM()

    config_override = {}
    if epochs is not None:
        config_override['epochs'] = epochs

    detector.train(epochs=epochs, verbose=verbose)

    if save_model:
        detector.save()

    return detector


if __name__ == '__main__':
    print("=" * 60)
    print("Testing LSTM Deep Learning Model Module")
    print("=" * 60)

    # Test 1: Train LSTM model (with reduced epochs for testing)
    print("\n1. Training LSTM Model (reduced epochs for testing)...")
    detector = ScamDetectorLSTM()
    metrics = detector.train(epochs=10, verbose=1)  # Reduced for testing

    # Test 2: Test predictions
    print("\n2. Testing predictions on synthetic sequences...")

    # Generate test sequences
    X_test, y_test = detector.generate_synthetic_sequence_data(
        n_scam_sequences=5,
        n_normal_sequences=5
    )

    print("\n   Predictions on test sequences:")
    for i, (seq, label) in enumerate(zip(X_test[:6], y_test[:6])):
        prob, pred = detector.predict_lstm_probability(seq)
        actual = "SCAM" if label == 1 else "NORMAL"
        predicted = "SCAM" if pred == 1 else "NORMAL"
        correct = "✓" if (pred == label) else "✗"
        print(f"   Seq {i+1}: Actual={actual}, Predicted={predicted}, Prob={prob:.3f} {correct}")

    # Test 3: Save model
    print("\n3. Saving LSTM model...")
    detector.save()

    # Test 4: Load model
    print("\n4. Loading LSTM model...")
    detector2 = ScamDetectorLSTM()
    loaded = detector2.load()

    if loaded:
        prob1, _ = detector.predict_lstm_probability(X_test[0])
        prob2, _ = detector2.predict_lstm_probability(X_test[0])
        print(f"   Original model prediction: {prob1:.4f}")
        print(f"   Loaded model prediction: {prob2:.4f}")
        print(f"   Predictions match: {abs(prob1 - prob2) < 0.01}")

    print("\n" + "=" * 60)
    print("LSTM Deep Learning Model Module Tests Complete!")
    print("=" * 60)
