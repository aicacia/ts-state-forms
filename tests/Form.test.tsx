import { State } from "@stembord/state";
import { createContext } from "@stembord/state-react";
import * as Enzyme from "enzyme";
import * as EnzymeAdapter from "enzyme-adapter-react-16";
import { Map, Record } from "immutable";
import { JSDOM } from "jsdom";
import * as React from "react";
import * as tape from "tape";
import {
  createFormsStore,
  IForm,
  IInjectedFormProps,
  IInputProps
} from "../lib";

const dom = new JSDOM("<!doctype html><html><body></body></html>");

(global as any).document = dom.window.document;
(global as any).window = dom.window;

const state = new State({ forms: Map<string, Record<IForm>>() }),
  { Consumer, Provider } = createContext(state.getState()),
  { selectField, injectForm } = createFormsStore(state, Consumer);

Enzyme.configure({ adapter: new EnzymeAdapter() });

interface ITestInputProps extends IInputProps {
  label: React.ReactNode;
}

class TestInput extends React.PureComponent<ITestInputProps> {
  render() {
    const {
      value,
      error,
      errors,
      label,
      onChange,
      onBlur,
      onFocus
    } = this.props;

    return (
      <div>
        <label>{label}</label>
        {error && errors.map(error => <span>{error.message}</span>)}
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

interface ISelectInputProps<T = any> extends IInputProps<T> {
  label: React.ReactNode;
  children: React.ReactNode;
  getDisplayValue(value: T): string;
}

function SelectInput<T = any>({
  value,
  error,
  errors,
  label,
  onChange,
  onBlur,
  onFocus,
  getDisplayValue,
  children
}: ISelectInputProps<T>) {
  return (
    <div>
      <label>{label}</label>
      {error && errors.map(error => <span>{error.message}</span>)}
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

interface IFormValues {
  name: string;
  gender: IGender;
}
interface IFormProps extends IInjectedFormProps {
  defaults?: IFormValues;
}

interface IGender {
  key: number;
  value: "Male" | "Female";
}

const GENDERS: IGender[] = [
    { key: 1, value: "Male" },
    { key: 2, value: "Female" }
  ],
  getGenderValue = (e: React.FormEvent) =>
    GENDERS.find(option => option.key === (e.target as any).value),
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
          {GENDERS.map(option => (
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
  changeset: changeset => changeset
})(Form);

interface IRootState {
  value: typeof state.current;
}

class Root extends React.Component<{}, IRootState> {
  formRef: React.RefObject<any>;
  isUpdating: boolean = false;

  constructor(props: {}) {
    super(props);

    this.formRef = React.createRef();

    this.state = {
      value: state.getState()
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
          defaults={{ name: "default", gender: GENDERS[0] }}
        />
      </Provider>
    );
  }
}

tape("connect update", (assert: tape.Test) => {
  const wrapper = Enzyme.mount(React.createElement(Root)),
    formId = (wrapper.instance() as Root).formRef.current.getFormId();

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

  assert.end();
});
