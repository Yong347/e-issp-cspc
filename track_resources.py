# track_resources.py
import sys
import time
import psutil

if len(sys.argv) < 2:
    print("Usage: python track_resources.py <PID_OF_CELERY_WORKER>")
    sys.exit(1)

pid = int(sys.argv[1])
try:
    process = psutil.Process(pid)
    print(f"Tracking process {pid} ({process.name()})")
    print("Time(s), CPU(%), Memory(MB)")
    
    start_time = time.time()
    while True:
        # Include child processes since Celery spawns pool workers
        children = process.children(recursive=True)
        total_cpu = process.cpu_percent(interval=0.1)
        total_memory_rss = process.memory_info().rss
        
        for child in children:
            try:
                total_cpu += child.cpu_percent(interval=None)
                total_memory_rss += child.memory_info().rss
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
                
        elapsed = time.time() - start_time
        mem_mb = total_memory_rss / (1024 * 1024)
        
        print(f"{elapsed:.1f}, {total_cpu:.1f}, {mem_mb:.1f}")
        time.sleep(1)
        
except psutil.NoSuchProcess:
    print(f"Process with PID {pid} has terminated.")
except KeyboardInterrupt:
    print("Monitoring stopped.")