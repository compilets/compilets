import CppFile from './cpp-file';

/**
 * Represent a C++ project that can be compiled to executable.
 */
export default class CppProject {
  name: string;
  files: [string, CppFile][] = [];

  constructor(name: string) {
    this.name = name;
  }

  addFile(name: string, file: CppFile) {
    this.files.push([name, file]);
  }

  getFiles(): [string, CppFile][] {
    return this.files;
  }
}
