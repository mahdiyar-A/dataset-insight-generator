#!/usr/bin/env bash
# One-time setup for a fresh DIG server (Lightsail, Ubuntu 24.04). Runs as root.
#
# Run it over SSH, NOT as a Lightsail "launch script":
#   ssh -i ~/.ssh/dig-key.pem ubuntu@<server-ip> 'sudo bash -s' < deploy/bootstrap.sh
#
# Lightsail prepends its own lines to a launch script and runs the result with
# /bin/sh, so this file's bash shebang is ignored there and `set -o pipefail`
# kills it on the spot. That is exactly how the first attempt failed.
#
# Safe to re-run.
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

# 2 GB swap. Building the .NET backend and pip-installing scipy/scikit-learn
# briefly need more than the 2 GB of RAM; without swap the build gets killed.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Logs are kept 30 days, then deleted: the DIG privacy policy promises exactly
# this. Daily journal files make the 30-day cutoff precise.
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/dig-retention.conf <<'EOF'
[Journal]
Storage=persistent
MaxRetentionSec=30day
MaxFileSec=1day
SystemMaxUse=1G
EOF
systemctl restart systemd-journald

# Docker from Ubuntu's own repositories. Containers log into the journal so
# the same 30-day retention covers application logs too.
apt-get update
apt-get install -y docker.io docker-compose-v2
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "journald" }
EOF
systemctl enable docker
systemctl restart docker
usermod -aG docker ubuntu

mkdir -p /opt/dig
chown ubuntu:ubuntu /opt/dig
touch /var/lib/dig-bootstrap-done
