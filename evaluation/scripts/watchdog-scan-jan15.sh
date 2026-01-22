#!/bin/bash
# Watchdog script for FMP scan Jan 15 - auto-restarts if process dies

LOG_FILE="/tmp/jan15-scan.log"
CHECKPOINT_FILE="/home/user/scam-dunk-re-write-claude-code/evaluation/results/fmp-checkpoint-2026-01-15.json"
RESULTS_FILE="/home/user/scam-dunk-re-write-claude-code/evaluation/results/fmp-evaluation-2026-01-15.json"
ALERT_FILE="/tmp/scan-alerts-jan15.log"

export FMP_API_KEY="9XxAhEnup4Fw7bvCmEant00kHojNer1s"

echo "[$(date)] Watchdog started for Jan 15" >> $ALERT_FILE

while true; do
    if [ -f "$RESULTS_FILE" ]; then
        echo "[$(date)] SCAN COMPLETE! Results saved to $RESULTS_FILE" >> $ALERT_FILE
        echo "SCAN COMPLETE!"
        exit 0
    fi

    SCAN_PID=$(pgrep -f "run-evaluation-fmp-dated.ts.*2026-01-15" | head -1)

    if [ -z "$SCAN_PID" ]; then
        PROCESSED=$(grep -c '"symbol"' "$CHECKPOINT_FILE" 2>/dev/null || echo "0")
        HIGH_COUNT=$(grep -c '"riskLevel": "HIGH"' "$CHECKPOINT_FILE" 2>/dev/null || echo "0")

        echo "[$(date)] ALERT: Scan died! Checkpoint: $PROCESSED/6970, $HIGH_COUNT HIGH. Restarting..." >> $ALERT_FILE

        cd /home/user/scam-dunk-re-write-claude-code
        npx tsx evaluation/scripts/run-evaluation-fmp-dated.ts --date 2026-01-15 >> $LOG_FILE 2>&1 &
        NEW_PID=$!
        echo "[$(date)] Restarted scan with PID: $NEW_PID" >> $ALERT_FILE

        sleep 10
    else
        PROCESSED=$(grep -c '"symbol"' "$CHECKPOINT_FILE" 2>/dev/null || echo "0")
        HIGH_COUNT=$(grep -c '"riskLevel": "HIGH"' "$CHECKPOINT_FILE" 2>/dev/null || echo "0")
        PERCENT=$((PROCESSED * 100 / 6970))
        echo "[$(date)] Running OK - PID: $SCAN_PID, Progress: $PROCESSED/6970 ($PERCENT%), $HIGH_COUNT HIGH" >> $ALERT_FILE
    fi

    sleep 30
done
