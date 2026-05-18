import subprocess, os, time, sys, argparse

def run_monkey(package_name, event_count, throttle, log_path):
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    
    with open(log_path, 'w', encoding='utf-8') as f:
        f.write(f'=== Monkey Test Start: {ts} ===\n')
        f.write(f'Target: {package_name}\n')
        f.write(f'Events: {event_count}, Throttle: {throttle}ms\n\n')
        
        # 唤醒并尝试解锁
        subprocess.run(['adb', 'shell', 'input', 'keyevent', '26'])
        time.sleep(1)
        subprocess.run(['adb', 'shell', 'input', 'keyevent', '82'])
        
        cmd = ['adb', 'exec-out', 'monkey', '-p', package_name,
               '--throttle', str(throttle), '--ignore-crashes', '--ignore-timeouts',
               '--ignore-security-exceptions', '-v', str(event_count)]
        
        print(f'Running Monkey on {package_name}...', flush=True)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        f.write(result.stdout)
        if result.stderr:
            f.write('\n--- STDERR ---\n' + result.stderr)
        
        ts2 = time.strftime('%Y-%m-%d %H:%M:%S')
        f.write(f'\n=== Monkey Test End: {ts2} (rc={result.returncode}) ===\n')
    
    return result.returncode, os.path.getsize(log_path)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pkg', required=True)
    parser.add_argument('--count', type=int, default=50000)
    parser.add_argument('--throttle', type=int, default=50)
    parser.add_argument('--log', required=True)
    args = parser.parse_args()
    
    rc, sz = run_monkey(args.pkg, args.count, args.throttle, args.log)
    print(f'Done. rc={rc}, log_size={sz}')
