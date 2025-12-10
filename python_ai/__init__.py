"""
Scam Detection System - AI-Driven Analysis for Financial Assets

This package provides a comprehensive system for detecting potential scams
in stocks and cryptocurrencies using:
- Statistical anomaly detection
- Machine Learning (Random Forest)
- Deep Learning (LSTM)
- Regulatory data integration (SEC flagged list)

Main components:
- data_ingestion: Load and preprocess market data
- feature_engineering: Compute technical indicators and features
- anomaly_detection: Detect statistical anomalies
- ml_model: Random Forest classifier
- lstm_model: LSTM neural network
- pipeline: Integration pipeline combining all components

Usage:
    from pipeline import ScamDetectionPipeline

    # Initialize and train
    pipeline = ScamDetectionPipeline(load_models=True)

    # Analyze a ticker
    result = pipeline.analyze(ticker='AAPL', use_synthetic=True)
    print(result.risk_level, result.combined_probability)
"""

__version__ = '1.0.0'
__author__ = 'ScamDunk Development Team'

from .pipeline import ScamDetectionPipeline, RiskAssessment, format_risk_output
from .data_ingestion import (
    create_asset_context,
    load_stock_data,
    load_crypto_data,
    check_sec_flagged_list
)
from .feature_engineering import engineer_all_features, create_feature_vector
from .anomaly_detection import detect_anomalies, AnomalyResult
from .ml_model import ScamDetectorRF, train_random_forest_model
from .lstm_model import ScamDetectorLSTM, train_lstm_model

__all__ = [
    'ScamDetectionPipeline',
    'RiskAssessment',
    'format_risk_output',
    'create_asset_context',
    'load_stock_data',
    'load_crypto_data',
    'check_sec_flagged_list',
    'engineer_all_features',
    'create_feature_vector',
    'detect_anomalies',
    'AnomalyResult',
    'ScamDetectorRF',
    'train_random_forest_model',
    'ScamDetectorLSTM',
    'train_lstm_model',
]
