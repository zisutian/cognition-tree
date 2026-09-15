import styles from "./Controls.module.css";

// React and CodeMirror share this class contract; each owns its DOM lifecycle.
export const checkboxControlClassName = `ui-checkbox-control ${styles["ui-checkbox-control"]}`;
