import Module from '@model-create/EPANET';

class Workspace {
  _instance: EmscriptenModule;
  _FS: EmscriptenFileSysten;
  constructor() {
    this._instance = Module();
    this._FS = this._instance.FS;
  }

  get version() {
    const intPointer = this._instance._malloc(4);
    //@ts-ignore
    var result = this._instance.getversion(intPointer);
    const returnValue = this._instance.getValue(intPointer, 'i32');

    this._instance._free(intPointer);

    return returnValue;
  }

  getError(code: number) {
    const title1Ptr = this._instance._malloc(1);
    //@ts-ignore
    const result = this._instance.geterror(code, title1Ptr);
    const errMessage = this._instance.UTF8ToString(title1Ptr);
    this._instance._free(title1Ptr);
    return errMessage;
  }

  writeFile(path: string, data: string | ArrayBufferView) {
    this._FS.writeFile(path, data);
  }

  readFile(file: string) {
    return this._FS.readFile(file, {
      encoding: 'utf8',
    });
  }
}

export default Workspace;
