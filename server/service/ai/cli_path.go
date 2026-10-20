package ai

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

// cliSearchPath extends the environment supplied by the app launcher with
// common user-level CLI install locations. GUI apps on macOS often do not
// inherit the PATH configured by a login shell.
func cliSearchPath() []string {
	seen := make(map[string]bool)
	paths := make([]string, 0, 24)
	add := func(path string) {
		if path == "" {
			return
		}
		for _, existing := range filepath.SplitList(os.Getenv("PATH")) {
			if existing == path {
				seen[path] = true
				break
			}
		}
		if !seen[path] {
			seen[path] = true
			paths = append(paths, path)
		}
	}

	for _, path := range filepath.SplitList(os.Getenv("PATH")) {
		add(path)
	}
	for _, path := range []string{"/usr/local/bin", "/usr/bin", "/bin"} {
		add(path)
	}

	if runtime.GOOS == "darwin" {
		add("/opt/homebrew/bin")
		add("/home/linuxbrew/.linuxbrew/bin")
	}

	if home, err := os.UserHomeDir(); err == nil && home != "" {
		for _, path := range []string{
			"bin",
			".local/bin",
			".npm/bin",
			".npm-global/bin",
			".volta/bin",
			".asdf/shims",
			".local/share/mise/shims",
		} {
			add(filepath.Join(home, filepath.FromSlash(path)))
		}
		if runtime.GOOS == "windows" {
			if appData := os.Getenv("APPDATA"); appData != "" {
				add(filepath.Join(appData, "npm"))
			}
		}
		// npm installs made through nvm commonly put Codex in one of these
		// version-specific bin directories.
		if versionPaths, err := filepath.Glob(filepath.Join(home, ".nvm", "versions", "node", "*", "bin")); err == nil {
			// Glob sorts paths lexically, which puts v12 before v24. Prefer the
			// highest installed nvm version when adding fallback paths.
			sort.Slice(versionPaths, func(i, j int) bool {
				return nodeVersionGreater(versionPaths[i], versionPaths[j])
			})
			for _, path := range versionPaths {
				add(path)
			}
		}
	}

	return paths
}

// preferNewestNVMNodePath makes the Codex CLI use the newest installed nvm
// runtime. The app launcher may already have put an old nvm version first in
// PATH, and Codex can fail during parsing before it can report that.
func preferNewestNVMNodePath(searchPath []string) []string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return searchPath
	}
	versionPaths, err := filepath.Glob(filepath.Join(home, ".nvm", "versions", "node", "*", "bin"))
	if err != nil {
		return searchPath
	}
	sort.Slice(versionPaths, func(i, j int) bool {
		return nodeVersionGreater(versionPaths[i], versionPaths[j])
	})
	for _, dir := range versionPaths {
		nodePath := filepath.Join(dir, "node")
		if _, err := exec.LookPath(nodePath); err != nil {
			continue
		}
		prioritized := make([]string, 0, len(searchPath)+1)
		prioritized = append(prioritized, dir)
		for _, path := range searchPath {
			if path != dir {
				prioritized = append(prioritized, path)
			}
		}
		return prioritized
	}
	return searchPath
}

func nodeVersionGreater(leftPath, rightPath string) bool {
	left := strings.Split(strings.TrimPrefix(filepath.Base(filepath.Dir(leftPath)), "v"), ".")
	right := strings.Split(strings.TrimPrefix(filepath.Base(filepath.Dir(rightPath)), "v"), ".")
	for i := 0; i < 3; i++ {
		leftPart, rightPart := 0, 0
		if i < len(left) {
			leftPart, _ = strconv.Atoi(left[i])
		}
		if i < len(right) {
			rightPart, _ = strconv.Atoi(right[i])
		}
		if leftPart != rightPart {
			return leftPart > rightPart
		}
	}
	return leftPath > rightPath
}

func resolveCLIExecutable(command string, searchPath []string) (string, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return "", fmt.Errorf("未配置 AI CLI 命令")
	}

	// Keep support for explicit absolute or relative executable paths.
	if filepath.IsAbs(command) || strings.ContainsAny(command, `/\\`) {
		resolved, err := exec.LookPath(command)
		if err != nil {
			return "", fmt.Errorf("找不到 AI CLI 可执行文件 %q: %w", command, err)
		}
		return resolved, nil
	}

	if resolved, err := exec.LookPath(command); err == nil {
		return resolved, nil
	}
	for _, dir := range searchPath {
		resolved, err := exec.LookPath(filepath.Join(dir, command))
		if err == nil {
			return resolved, nil
		}
	}
	return "", fmt.Errorf("找不到 AI CLI 可执行文件 %q。请安装该 CLI，或在助手设置中填写可执行文件的完整路径", command)
}

func cliCommandEnv(searchPath []string) []string {
	pathValue := strings.Join(searchPath, string(os.PathListSeparator))
	env := os.Environ()
	for i, value := range env {
		if key, _, ok := strings.Cut(value, "="); ok && strings.EqualFold(key, "PATH") {
			env[i] = key + "=" + pathValue
			return env
		}
	}
	return append(env, "PATH="+pathValue)
}
