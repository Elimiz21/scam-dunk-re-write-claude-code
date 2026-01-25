#!/bin/bash
# Watchdog script for FMP scan Jan 16 - ROBUST version
# Uses the crash-proof run-evaluation-fmp-robust.ts script

LOG_FILE="/tmp/jan16-scan.log"
CHECKPOINT_FILE="/home/user/scam-dunk-re-write-claude-code/evaluation/results/fmp-checkpoint-2026-01-16.json"
RESULTS_FILE="/home/user/scam-dunk-re-write-claude-code/evaluation/results/fmp-evaluation-2026-01-16.json"
ALERT_FILE="/tmp/scan-alerts-jan16.log"

export FMP_API_KEY="9XxAhEnup4Fw7bvCmEant00kHojNer1s"

echo "[$(date)] Watchdog started for Jan 16 (ROBUST)" >> $ALERT_FILE

while true; do
    # Check if results file exists (scan complete)
    if [ -f "$RESULTS_FILE" ]; then
        echo "[$(date)] SCAN COMPLETE! Results saved to $RESULTS_FILE" >> $ALERT_FILE
        echo "SCAN COMPLETE!"
        exit 0
    fi

    # Check if scan process is running (match robust script)
    SCAN_PID=$(pgrep -f "run-evaluation-fmp-robust.ts.*2026-01-16" | head -1)

    if [ -z "$SCAN_PID" ]; then
        # Process not running - read lightweight checkpoint
        if [ -f "$CHECKPOINT_FILE" ]; then
            PROCESSED=$(python3 -c "import json; d=json.load(open('$CHECKPOINT_FILE')); print(len(d.get('processedSymbols',[])))" 2>/dev/null || echo "0")
            HIGH_COUNT=$(python3 -c "import json; d=json.load(open('$CHECKPOINT_FILE')); print(d.get('counts',{}).get('HIGH',0))" 2>/dev/null || echo "0")
        else
            PROCESSED="0"
            HIGH_COUNT="0"
        fi

        echo "[$(date)] ALERT: Scan died! Checkpoint: $PROCESSED/6970, $HIGH_COUNT HIGH. Restarting..." >> $ALERT_FILE

        # Restart the scan with robust script
        cd /home/user/scam-dunk-re-write-claude-code
        npx tsx evaluation/scripts/run-evaluation-fmp-robust.ts --date 2026-01-16 >> $LOG_FILE 2>&1 &
        NEW_PID=$!
        echo "[$(date)] Restarted scan with PID: $NEW_PID" >> $ALERT_FILE

        sleep 15  # Give process time to start and load checkpoint
    else
        # Process running - read lightweight checkpoint for status
        if [ -f "$CHECKPOINT_FILE" ]; then
            PROCESSED=$(python3 -c "import json; d=json.load(open('$CHECKPOINT_FILE')); print(len(d.get('processedSymbols',[])))" 2>/dev/null || echo "?")
            HIGH_COUNT=$(python3 -c "import json; d=json.load(open('$CHECKPOINT_FILE')); print(d.get('counts',{}).get('HIGH',0))" 2>/dev/null || echo "?")
        else
            PROCESSED="starting"
            HIGH_COUNT="0"
        fi
        PERCENT=$((PROCESSED * 100 / 6970)) 2>/dev/null || PERCENT="?"
        echo "[$(date)] Running OK - PID: $SCAN_PID, Progress: $PROCESSED/6970 ($PERCENT%), $HIGH_COUNT HIGH" >> $ALERT_FILE
    fi

    # Check every 60 seconds (less aggressive)
    sleep 60
done
