export class Bridge {
    constructor(editor, viewer) {
        this.editor = editor;
        this.viewer = viewer;

        // 用于防止频繁更新的标志位
        this.isUpdatePending = false;

        // 绑定回调
        this.editor.onUpdate = () => {
            // 如果已经有一个更新在排队了，就不要再安排新的了
            if (!this.isUpdatePending) {
                this.isUpdatePending = true;
                
                // 使用 requestAnimationFrame 在下一帧统一处理
                requestAnimationFrame(() => {
                    this.viewer.updateTexture(this.editor.getElement());
                    this.isUpdatePending = false;
                });
            }
        };

        // 初始同步 (稍微延时一点，确保图片加载完了)
        setTimeout(() => {
            this.viewer.updateTexture(this.editor.getElement());
        }, 200);
    }
}