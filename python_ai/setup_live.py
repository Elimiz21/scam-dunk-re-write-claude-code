#!/usr/bin/env python3
"""
Live API Setup Script for Scam Detection System.

This script helps you:
1. Configure API keys
2. Test API connections
3. Run a live analysis

Run: python3 setup_live.py
"""

import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = SCRIPT_DIR / '.env'
ENV_EXAMPLE = SCRIPT_DIR / '.env.example'


def print_header(text):
    print("\n" + "=" * 60)
    print(text)
    print("=" * 60)


def check_env_file():
    """Check if .env file exists and has API keys."""
    if not ENV_FILE.exists():
        return None, "NOT_FOUND"

    with open(ENV_FILE) as f:
        content = f.read()

    # Check for Alpha Vantage key
    if 'ALPHA_VANTAGE_API_KEY=' in content:
        lines = content.split('\n')
        for line in lines:
            if line.startswith('ALPHA_VANTAGE_API_KEY='):
                key = line.split('=', 1)[1].strip().strip('"\'')
                if key and key != 'your_alpha_vantage_key_here':
                    return key, "CONFIGURED"
                return None, "EMPTY"

    return None, "MISSING"


def create_env_file(api_key: str):
    """Create or update .env file with API key."""
    content = f'''# Scam Detection System - API Configuration

# Alpha Vantage (Required for stock data)
# Get free key at: https://www.alphavantage.co/support/#api-key
ALPHA_VANTAGE_API_KEY={api_key}

# CoinGecko (Optional - works without key for basic usage)
COINGECKO_API_KEY=
'''
    with open(ENV_FILE, 'w') as f:
        f.write(content)
    print(f"   ✓ Created {ENV_FILE}")


def run_api_test():
    """Run API connection tests."""
    print("\nTesting API connections...")
    from live_data import test_api_connections
    return test_api_connections()


def run_live_analysis(ticker: str):
    """Run live analysis on a ticker."""
    from pipeline import ScamDetectionPipeline, format_risk_output
    from data_ingestion import create_live_asset_context, preprocess_price_data
    from feature_engineering import engineer_all_features

    print(f"\nAnalyzing {ticker} with LIVE data...")

    # Load live data
    context = create_live_asset_context(ticker)

    # Initialize pipeline
    pipeline = ScamDetectionPipeline(load_models=True)

    if not pipeline.rf_available:
        print("Training models (first run)...")
        pipeline.train_models(train_rf=True, train_lstm=True, lstm_epochs=10)

    # Run analysis using the live context
    price_data = context['price_data']
    fundamentals = context['fundamentals']

    assessment = pipeline.analyze(
        ticker=ticker,
        price_data=price_data,
        fundamentals=fundamentals,
        news_flag=False,
        use_synthetic=False
    )

    print(format_risk_output(assessment))
    return assessment


def main():
    print_header("SCAM DETECTION SYSTEM - LIVE DATA SETUP")

    # Step 1: Check .env file
    print("\n[Step 1] Checking configuration...")
    api_key, status = check_env_file()

    if status == "CONFIGURED":
        print(f"   ✓ Alpha Vantage API key found")
    elif status == "NOT_FOUND":
        print("   ✗ No .env file found")
    elif status == "EMPTY":
        print("   ✗ API key is empty in .env file")
    else:
        print("   ✗ API key not configured")

    # Step 2: Get API key if needed
    if status != "CONFIGURED":
        print_header("ALPHA VANTAGE API KEY SETUP")
        print("""
To analyze REAL stock data, you need a free Alpha Vantage API key.

Steps to get your free key:
  1. Go to: https://www.alphavantage.co/support/#api-key
  2. Enter your email
  3. Click "GET FREE API KEY"
  4. Copy the key they give you

Free tier allows 25 API calls per day (enough for testing).
""")

        api_key = input("Paste your Alpha Vantage API key here (or press Enter to skip): ").strip()

        if api_key:
            create_env_file(api_key)
            print("   ✓ API key saved!")
        else:
            print("   Skipped. You can run this script again later.")
            print("   Or manually create .env file from .env.example")

    # Step 3: Test connections
    if api_key or status == "CONFIGURED":
        print_header("TESTING API CONNECTIONS")
        results = run_api_test()

        all_ok = all(r['status'] == 'OK' for r in results.values())

        if all_ok:
            # Step 4: Run a test analysis
            print_header("LIVE ANALYSIS TEST")
            print("\nLet's test with a real stock!")

            ticker = input("Enter a stock ticker to analyze (default: AAPL): ").strip().upper()
            if not ticker:
                ticker = 'AAPL'

            try:
                assessment = run_live_analysis(ticker)
                print(f"\n✓ Live analysis complete!")
                print(f"   {ticker}: {assessment.risk_level} risk ({assessment.combined_probability*100:.0f}%)")
            except Exception as e:
                print(f"\n✗ Analysis failed: {e}")
                print("   This may be due to API rate limits. Try again in a minute.")

        else:
            print("\n⚠ Some API connections failed. Fix the issues above first.")

    print_header("SETUP COMPLETE")
    print("""
Usage:

  # Run with live data:
  python3 main.py --ticker AAPL --live

  # Test crypto:
  python3 main.py --ticker BTC --live

  # Run tests with synthetic data:
  python3 main.py --test
""")


if __name__ == '__main__':
    os.chdir(SCRIPT_DIR)
    main()
