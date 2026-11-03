#!/usr/bin/env python3
"""Cuts the small clips of the landing page (home.html, "What you can do") out of the takes of the teaser film (teaser/work/*.mp4, made by
make_teaser.py: the real page, recorded). Each clip is the whole 16:9 frame of the take (the dashboard as it is, 1280 x 720), H.264, no sound, one or more
stretches of a take joined, and a poster frame next to it: images/home/clips/<name>.mp4 and <name>.jpg. Rerun after make_teaser.py when the look of the page
changes. `numbers` also uses trails.mp4 (made by record_home_extras.py, as is size.mp4). ffmpeg from the PATH or imageio-ffmpeg."""
import os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, 'teaser', 'work')
OUT = os.path.join(ROOT, 'images', 'home', 'clips')

# name: (take, [(start s, end s), ...], poster at s); the stretches of 'years' leave out the seconds where the Layers menu is open in that take
CLIPS = {
    'years':   ('wide-map', [(0.2, 4.2), (7.0, 8.3)], 1.5),         # timelapse of Aletsch
    'compare': ('wide-map', [(8.6, 15.4)], 10.0),                   # the slider between two summers
    'fly':     ('wide-3d', [(0.2, 9.2)], 5.0),                      # 3D flight over the ice
    'then':    ('wide-3d', [(12.4, 18.8)], 15.0),                   # then and now: a photograph over the 3D view
    'numbers': ('numbers', [('trails.mp4', 1.5, 13.0), ('wide-stats', 2.0, 8.5)], 8.0),        # Discover (trails in view, Hike and bike) and then the figures of the glacier
    'share':   ('wide-product', [(0.2, 4.4)], 2.0),                 # pictures and videos for the phone
    'cross':   ('wide-cross', [(0.2, 8.4)], 7.0),                   # the thickness cross-section: a line across the tongue, the ice above the bed
}

def ffmpeg():
    exe = shutil.which('ffmpeg')
    if exe: return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

def main():
    exe = ffmpeg(); os.makedirs(OUT, exist_ok=True)
    for name, (take, parts, post) in CLIPS.items():
        if sys.argv[1:] and name not in sys.argv[1:]: continue      # `make_home_clips.py cross` cuts only that clip
        if take == 'numbers':      # stretches of several files joined (the first one is recorded by record_home_extras.py)
            files = [os.path.join(OUT, f) if f.endswith('.mp4') else os.path.join(WORK, f + '.mp4') for f, _, _ in parts]
            cmd = [exe, '-y', '-loglevel', 'error'] + sum((['-i', f] for f in files), [])
            fc = ''.join('[%d:v]trim=%s:%s,setpts=PTS-STARTPTS,scale=1280:720:flags=lanczos,fps=25[v%d];' % (i, a, b, i) for i, (_, a, b) in enumerate(parts)) + ''.join('[v%d]' % i for i in range(len(parts))) + 'concat=n=%d:v=1:a=0,format=yuv420p[o]' % len(parts)
            subprocess.run(cmd + ['-filter_complex', fc, '-map', '[o]', '-an', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart', os.path.join(OUT, name + '.mp4')], check=True)
            subprocess.run([exe, '-y', '-loglevel', 'error', '-ss', str(post), '-i', os.path.join(OUT, name + '.mp4'), '-frames:v', '1', '-q:v', '3', os.path.join(OUT, name + '.jpg')], check=True)
            print(name, os.path.getsize(os.path.join(OUT, name + '.mp4')) // 1024, 'KB'); continue
        src = os.path.join(WORK, take + '.mp4')
        cut = ''.join('[0:v]trim=%s:%s,setpts=PTS-STARTPTS[v%d];' % (a, b, i) for i, (a, b) in enumerate(parts))
        fc = cut + ''.join('[v%d]' % i for i in range(len(parts))) + 'concat=n=%d:v=1:a=0,scale=1280:720:flags=lanczos,format=yuv420p[o]' % len(parts)
        subprocess.run([exe, '-y', '-loglevel', 'error', '-i', src, '-filter_complex', fc, '-map', '[o]', '-an', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow',
                        '-movflags', '+faststart', os.path.join(OUT, name + '.mp4')], check=True)
        subprocess.run([exe, '-y', '-loglevel', 'error', '-ss', str(post), '-i', src, '-frames:v', '1', '-q:v', '3', os.path.join(OUT, name + '.jpg')], check=True)
        print(name, os.path.getsize(os.path.join(OUT, name + '.mp4')) // 1024, 'KB')

if __name__ == '__main__':
    sys.exit(main())
