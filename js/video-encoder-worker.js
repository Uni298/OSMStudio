import { Muxer, ArrayBufferTarget } from '../libs/mp4-muxer.js';

let muxer = null;
let videoEncoder = null;
let videoConfig = null; // Store encoder config

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    try {
        if (type === 'configure') {
            const { width, height, fps, bitrate, codec } = payload;

            // Store config for later use
            videoConfig = {
                codec: codec,
                width: width,
                height: height,
                bitrate: bitrate,
                framerate: fps,
                latencyMode: 'quality', // Optimize for quality over latency
                alpha: 'discard'        // No transparency needed for map export
            };

            muxer = new Muxer({
                target: new ArrayBufferTarget(),
                video: {
                    codec: 'avc',
                    width: width,
                    height: height
                },
                fastStart: 'in-memory',
                firstTimestampBehavior: 'offset'
            });

            videoEncoder = new VideoEncoder({
                output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                error: e => {
                    console.error('Worker Encoder Error:', e);
                    self.postMessage({ type: 'error', error: e.message });
                }
            });

            videoEncoder.configure(videoConfig);

            self.postMessage({ type: 'configured' });

        } else if (type === 'encode') {
            const { bitmap, timestamp, keyFrame } = payload;
            
            const frame = new VideoFrame(bitmap, { timestamp });
            videoEncoder.encode(frame, { keyFrame });
            frame.close();
            
            // Close the bitmap (released from main thread via transfer)
            if (bitmap) bitmap.close();

        } else if (type === 'finalize') {
            if (videoEncoder && videoEncoder.state !== 'closed') {
                await videoEncoder.flush();
            }
            if (muxer) {
                muxer.finalize();
                const buffer = muxer.target.buffer;
                // Send back the buffer
                self.postMessage({ type: 'complete', buffer }, [buffer]);
            } else {
                throw new Error('Muxer not initialized');
            }
        }

    } catch (err) {
        console.error('Worker Error:', err);
        self.postMessage({ type: 'error', error: err.message });
    }
};
