"""Helper to run commands on VPS via SSH"""
import paramiko
import sys
import os

HOST = '89.167.90.248'
USER = 'root'
PASS = 'February_2026'

def run(cmd, timeout=60):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=10)
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    ssh.close()
    if out: print(out)
    if err: print(err, file=sys.stderr)
    return code

def upload(local_path, remote_path):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=10)
    sftp = ssh.open_sftp()
    sftp.put(local_path, remote_path)
    sftp.close()
    ssh.close()

def upload_dir(local_dir, remote_dir):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=10)
    sftp = ssh.open_sftp()

    for root, dirs, files in os.walk(local_dir):
        for d in dirs:
            remote_subdir = os.path.join(remote_dir, os.path.relpath(os.path.join(root, d), local_dir)).replace('\\', '/')
            try:
                sftp.mkdir(remote_subdir)
            except:
                pass
        for f in files:
            local_file = os.path.join(root, f)
            remote_file = os.path.join(remote_dir, os.path.relpath(local_file, local_dir)).replace('\\', '/')
            sftp.put(local_file, remote_file)

    sftp.close()
    ssh.close()

if __name__ == '__main__':
    if len(sys.argv) > 1:
        run(' '.join(sys.argv[1:]))
