const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

/**
 * Encode video from frames using FFmpeg
 * @param {string} frameDir - Directory containing frame images
 * @param {string} outputPath - Output video file path
 * @param {number} fps - Frames per second
 * @param {string} quality - Quality setting (high, medium, low)
 * @returns {Promise<void>}
 */
function encodeVideo(frameDir, outputPath, fps = 30, quality = 'high') {
    return new Promise((resolve, reject) => {
        // Quality settings
        const qualitySettings = {
            high: { crf: 18, preset: 'slow' },
            medium: { crf: 23, preset: 'medium' },
            low: { crf: 28, preset: 'fast' }
        };

        const settings = qualitySettings[quality] || qualitySettings.medium;

        // Input pattern for frames
        const inputPattern = path.join(frameDir, 'frame_%06d.png');

        console.log(`Encoding video: ${inputPattern} -> ${outputPath}`);
        console.log(`Settings: ${fps} FPS, CRF ${settings.crf}, preset ${settings.preset}`);

        ffmpeg()
            .input(inputPattern)
            .inputFPS(fps)
            .videoCodec('libx264')
            .outputOptions([
                `-crf ${settings.crf}`,
                `-preset ${settings.preset}`,
                '-pix_fmt yuv420p',
                '-movflags +faststart'
            ])
            .output(outputPath)
            .on('start', (commandLine) => {
                console.log('FFmpeg command:', commandLine);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`Encoding progress: ${Math.round(progress.percent)}%`);
                }
            })
            .on('end', () => {
                console.log('Video encoding completed');
                resolve();
            })
            .on('error', (error) => {
                console.error('FFmpeg error:', error);
                reject(error);
            })
            .run();
    });
}

module.exports = { encodeVideo };
