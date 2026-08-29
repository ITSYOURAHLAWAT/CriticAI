"""
CriticAI Alert Manager — Slack & Discord Webhook Notifications

Sends automatic alerts when:
  - Model health score drops below threshold
  - Red-team attack successfully compromises a model
  - Evaluation pipeline encounters critical errors

Configuration via environment variables:
  SLACK_WEBHOOK_URL    — Slack Incoming Webhook URL
  DISCORD_WEBHOOK_URL  — Discord Webhook URL
  ALERT_THRESHOLD      — Health score below which alerts fire (default: 50)
"""

import os
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger("criticai.alerts")


def _load_config() -> dict:
    """Read alert config from environment."""
    return {
        "slack_url": os.environ.get("SLACK_WEBHOOK_URL", "").strip(),
        "discord_url": os.environ.get("DISCORD_WEBHOOK_URL", "").strip(),
        "threshold": int(os.environ.get("ALERT_THRESHOLD", "50")),
    }


def send_slack_alert(message: str, webhook_url: str) -> dict:
    """
    Send a message to a Slack channel via Incoming Webhook.

    Args:
        message: Plain text or Slack markdown message
        webhook_url: Slack Incoming Webhook URL (from api.slack.com/apps)

    Returns:
        {"ok": bool, "message": str}
    """
    if not webhook_url:
        return {"ok": False, "message": "No Slack webhook URL configured"}

    try:
        import httpx

        payload = {
            "text": message,
            "username": "CriticAI Alerts",
            "icon_emoji": ":robot_face:",
        }
        resp = httpx.post(webhook_url, json=payload, timeout=10)

        if resp.status_code == 200 and resp.text == "ok":
            logger.info("Slack alert sent successfully")
            return {"ok": True, "message": "Slack alert sent successfully"}
        else:
            logger.warning(f"Slack alert failed: HTTP {resp.status_code} — {resp.text}")
            return {"ok": False, "message": f"Slack returned HTTP {resp.status_code}: {resp.text}"}

    except Exception as exc:
        logger.error(f"Slack alert error: {exc}")
        return {"ok": False, "message": str(exc)}


def send_discord_alert(message: str, webhook_url: str) -> dict:
    """
    Send a message to a Discord channel via Webhook.

    Args:
        message: Plain text or Discord markdown message
        webhook_url: Discord Webhook URL (from Server Settings → Integrations)

    Returns:
        {"ok": bool, "message": str}
    """
    if not webhook_url:
        return {"ok": False, "message": "No Discord webhook URL configured"}

    try:
        import httpx

        payload = {
            "content": message,
            "username": "CriticAI",
            "avatar_url": "https://cdn-icons-png.flaticon.com/512/4233/4233830.png",
        }
        resp = httpx.post(webhook_url, json=payload, timeout=10)

        if resp.status_code in (200, 204):
            logger.info("Discord alert sent successfully")
            return {"ok": True, "message": "Discord alert sent successfully"}
        else:
            logger.warning(f"Discord alert failed: HTTP {resp.status_code} — {resp.text}")
            return {"ok": False, "message": f"Discord returned HTTP {resp.status_code}: {resp.text}"}

    except Exception as exc:
        logger.error(f"Discord alert error: {exc}")
        return {"ok": False, "message": str(exc)}


def send_test_alert(slack_url: str = "", discord_url: str = "") -> dict:
    """
    Send a test ping to configured webhooks to verify they work.

    Returns:
        {"slack": {"ok": bool, "message": str}, "discord": {...}}
    """
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    test_message = (
        f"✅ *CriticAI Test Alert* — {ts}\n"
        f"Your webhook is correctly configured!\n"
        f"You will receive notifications here when model evaluations fail or drop below threshold."
    )

    results = {}

    # Use passed URLs or fall back to env vars
    s_url = slack_url or os.environ.get("SLACK_WEBHOOK_URL", "")
    d_url = discord_url or os.environ.get("DISCORD_WEBHOOK_URL", "")

    if s_url:
        results["slack"] = send_slack_alert(test_message, s_url)
    else:
        results["slack"] = {"ok": False, "message": "No Slack webhook URL provided"}

    if d_url:
        results["discord"] = send_discord_alert(test_message, d_url)
    else:
        results["discord"] = {"ok": False, "message": "No Discord webhook URL provided"}

    return results


def send_evaluation_alert(
    evaluation_result: dict,
    slack_url: str = "",
    discord_url: str = "",
    threshold: Optional[int] = None,
) -> dict:
    """
    Evaluate results and fire alerts if health score is below threshold
    or if red-team attacks succeeded.

    Args:
        evaluation_result: The dict returned by the orchestrator run()
        slack_url: Override env var SLACK_WEBHOOK_URL
        discord_url: Override env var DISCORD_WEBHOOK_URL
        threshold: Override env var ALERT_THRESHOLD

    Returns:
        {"alerted": bool, "reason": str, "results": dict}
    """
    cfg = _load_config()
    s_url = slack_url or cfg["slack_url"]
    d_url = discord_url or cfg["discord_url"]
    alert_threshold = threshold if threshold is not None else cfg["threshold"]

    # Extract key metrics
    health_score = evaluation_result.get("health_score", 100)
    model = evaluation_result.get("model", "unknown")
    pass_rate = evaluation_result.get("pass_rate", 100)
    red_team = evaluation_result.get("red_team_summary", {})
    compromised = red_team.get("critical_vulnerabilities", 0) > 0

    reasons = []

    if health_score < alert_threshold:
        reasons.append(f"Health score dropped to *{health_score:.1f}/100* (threshold: {alert_threshold})")

    if compromised:
        vuln_count = red_team.get("critical_vulnerabilities", 0)
        reasons.append(f"*{vuln_count} critical red-team vulnerability/vulnerabilities detected*")

    if pass_rate < 30:
        reasons.append(f"Pass rate is critically low: *{pass_rate:.1f}%*")

    if not reasons:
        return {"alerted": False, "reason": "All metrics within normal range", "results": {}}

    # Build alert message
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    reason_text = "\n• ".join(reasons)

    message = (
        f"🚨 *CriticAI Alert* — {ts}\n\n"
        f"*Model:* `{model}`\n"
        f"*Health Score:* {health_score:.1f}/100\n"
        f"*Pass Rate:* {pass_rate:.1f}%\n\n"
        f"*Issues detected:*\n• {reason_text}\n\n"
        f"Review the full report at: http://localhost:3000/reports"
    )

    alert_results = {}
    if s_url:
        alert_results["slack"] = send_slack_alert(message, s_url)
    if d_url:
        alert_results["discord"] = send_discord_alert(message, d_url)

    return {
        "alerted": True,
        "reason": "; ".join(reasons),
        "results": alert_results,
    }
