import { ChangesetError } from "@aicacia/changeset";
import { State } from "@aicacia/state";
import { createContext } from "@aicacia/state-react";
import * as Enzyme from "enzyme";
import * as EnzymeAdapter from "enzyme-adapter-react-16";
import * as React from "react";
import * as tape from "tape";
import {
  createFormsStore,
  IInjectedFormProps,
  IInputProps,
  INITIAL_STATE as forms,
} from ".";
// @ts-ignore
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");

(global as any).document = dom.window.document;
(global as any).window = dom.window;

const INITIAL_STATE = { forms };

const state = new State(INITIAL_STATE),
  { Consumer, Provider } = createContext(state.getState()),
  {
    selectField,
    selectForm,
    selectFormExists,
    injectForm,
    addError,
    addFieldError,
    selectErrors,
    selectFieldErrors,
  } = createFormsStore(state, Consumer);

Enzyme.configure({ adapter: new EnzymeAdapter() });

interface ITestInputProps extends IInputProps<string> {
  label: React.ReactNode;
}

class TestInput extends React.PureComponent<ITestInputProps> {
  render() {
    const {
      value,
      focus,
      error,
      errors,
      label,
      onChange,
      onBlur,
      onFocus,
    } = this.props;

    return (
      <div>
        {focus && <span className="focus">Focus</span>}
        <label>{label}</label>
        {error &&
          errors.map((error, index) => (
            <span className="error" key={index}>
              {error.get("message")}
            </span>
          ))}
        <input
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
        />
      </div>
    );
  }
}

interface ISelectInputProps<V> extends IInputProps<V> {
  label: React.ReactNode;
  children: React.ReactNode;
  getDisplayValue(value: V): string;
}

function SelectInput<V>({
  value,
  error,
  errors,
  label,
  onChange,
  onBlur,
  onFocus,
  getDisplayValue,
  children,
}: ISelectInputProps<V>) {
  return (
    <div>
      <label>{label}</label>
      {error &&
        errors.map((error, index) => (
          <span className="error" key={index}>
            {error.get("message")}
          </span>
        ))}
      <select
        value={getDisplayValue(value)}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
      >
        {children}
      </select>
    </div>
  );
}

interface IGender {
  key: number;
  value: "Male" | "Female";
}

interface IFormValues {
  name: string;
  gender: IGender;
}
type IFormProps = IInjectedFormProps<IFormValues>;

const GENDERS: IGender[] = [
    { key: 1, value: "Male" },
    { key: 2, value: "Female" },
  ],
  getGenderValue = (e: React.FormEvent) =>
    GENDERS.find((option) => option.key === (e.target as any).value),
  getGenderDisplayValue = ({ value }: IGender) => value;

class Form extends React.PureComponent<IFormProps> {
  render() {
    const { Field } = this.props;

    return (
      <form>
        <Field name="name" label="Name" Component={TestInput} />
        <Field
          name="gender"
          label="Gender"
          getValue={getGenderValue}
          getDisplayValue={getGenderDisplayValue}
          Component={
            SelectInput as React.ComponentType<ISelectInputProps<IGender>>
          }
        >
          {GENDERS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.value}
            </option>
          ))}
        </Field>
      </form>
    );
  }
}

const ConnectedForm = injectForm<IFormValues>({
  timeout: 0,
  changeset: (changeset) => changeset.validateRequired(["name", "gender"]),
})(Form);

interface IRootProps {
  defaults: Partial<IFormValues>;
  onFormChange?(props: IFormProps): void;
  onFormChangeValid?(props: IFormProps): void;
}

interface IRootState {
  value: ReturnType<typeof state.getState>;
}

class Root extends React.Component<IRootProps, IRootState> {
  formRef: React.RefObject<any>;
  isUpdating: boolean = false;

  constructor(props: IRootProps) {
    super(props);

    this.formRef = React.createRef();

    this.state = {
      value: state.getState(),
    };

    state.addListener("set-state", () => {
      this.setState({ value: state.getState() });
    });
  }
  render() {
    return (
      <Provider value={this.state.value}>
        <ConnectedForm
          ref={this.formRef}
          onFormChange={this.props.onFormChange}
          onFormChangeValid={this.props.onFormChangeValid}
          defaults={this.props.defaults}
        />
      </Provider>
    );
  }
}

tape("connect update", (assert: tape.Test) => {
  let onFormChangeCalled = 0,
    onFormChangeValidCalled = 0;

  const onFormChange = () => {
      onFormChangeCalled++;
    },
    onFormChangeValid = () => {
      onFormChangeValidCalled++;
    },
    wrapper = Enzyme.mount(
      <Root
        onFormChange={onFormChange}
        onFormChangeValid={onFormChangeValid}
        defaults={{ name: "default", gender: GENDERS[0] }}
      />
    ),
    formId = (wrapper.instance() as Root).formRef.current.getFormId();

  assert.equals(
    selectForm(state.getState(), formId).get("valid"),
    true,
    "form should be valid"
  );

  assert.equals(
    ((wrapper.instance() as Root).formRef.current.constructor as any)
      .displayName,
    "Form(Form)",
    "should wrap component name"
  );

  assert.equals(
    selectField(state.getState(), formId, "name").get("value"),
    "default",
    "store's name not set to default"
  );
  wrapper.find("input").simulate("change", { target: { value: "Billy" } });
  assert.equals(
    selectField(state.getState(), formId, "name").get("value"),
    "Billy",
    "store's name should update"
  );

  wrapper.find("input").simulate("focus", {});
  assert.equals(
    wrapper.exists("div .focus"),
    true,
    "should focus the input element"
  );
  wrapper.find("input").simulate("blur", {});
  assert.equals(
    !wrapper.exists("div .focus"),
    true,
    "should blur the input element"
  );

  assert.deepEquals(
    selectField(state.getState(), formId, "gender").get("value"),
    GENDERS[0],
    "store's gender not set to default"
  );
  wrapper.find("select").simulate("change", { target: { value: 2 } });
  assert.deepEquals(
    selectField(state.getState(), formId, "gender").get("value"),
    GENDERS[1],
    "store's gender should update"
  );

  wrapper.find("input").simulate("change", { target: { value: "" } });
  assert.deepEquals(
    selectField(state.getState(), formId, "name").get("errors").toJS(),
    [{ message: "required", values: [], meta: undefined }],
    "store's should have errors from changeset"
  );
  assert.false(
    selectForm(state.getState(), formId).get("valid"),
    "store's should not be valid"
  );

  addError(formId, ChangesetError({ message: "invalid", values: [] }));
  assert.deepEquals(
    selectErrors(state.getState(), formId).toJS(),
    [{ message: "invalid", values: [], meta: undefined }],
    "store's should have errors from addError"
  );

  addFieldError(
    formId,
    "gender",
    ChangesetError({ message: "invalid_gender", values: [] })
  );
  assert.deepEquals(
    selectFieldErrors(state.getState(), formId, "gender").toJS(),
    [{ message: "invalid_gender", values: [], meta: undefined }],
    "store's should have errors from addFieldError"
  );

  assert.equals(onFormChangeCalled, 4);
  assert.equals(onFormChangeValidCalled, 3);

  wrapper.unmount();

  assert.false(selectFormExists(state.getState(), formId));
  assert.end();
});

tape("without defaults connect update", (assert: tape.Test) => {
  const wrapper = Enzyme.mount(<Root defaults={{}} />),
    formId = (wrapper.instance() as Root).formRef.current.getFormId();

  assert.equals(
    selectForm(state.getState(), formId).get("valid"),
    false,
    "form should be invalid"
  );
  assert.equals(
    selectField(state.getState(), formId, "name").get("value"),
    "",
    "store's name not set"
  );

  wrapper.unmount();

  assert.false(selectFormExists(state.getState(), formId));
  assert.end();
});
